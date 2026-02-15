import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Activity, InsertActivity } from '@shared/schema';

export type ActivityType = 'run' | 'ski' | 'hike' | 'bike';

interface TrackPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  timestamp: number;
  speed: number | null;
}

interface ActivityStats {
  distance: number; // meters
  elapsedTime: number; // seconds
  movingTime: number; // seconds
  averageSpeed: number; // m/s
  maxSpeed: number; // m/s
  currentSpeed: number; // m/s
  averagePace: number; // seconds per km
  currentPace: number; // seconds per km
  elevationGain: number; // meters
  elevationLoss: number; // meters
  currentAltitude: number | null; // meters
}

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  activityType: ActivityType;
  startTime: Date | null;
  trackPoints: TrackPoint[];
  stats: ActivityStats;
  currentPosition: { latitude: number; longitude: number } | null;
}

const initialStats: ActivityStats = {
  distance: 0,
  elapsedTime: 0,
  movingTime: 0,
  averageSpeed: 0,
  maxSpeed: 0,
  currentSpeed: 0,
  averagePace: 0,
  currentPace: 0,
  elevationGain: 0,
  elevationLoss: 0,
  currentAltitude: null,
};

const MIN_ACCURACY_THRESHOLD = 30; // meters - filter out inaccurate readings
const MIN_DISTANCE_THRESHOLD = 3; // meters - minimum distance between points
const STATIONARY_SPEED_THRESHOLD = 0.3; // m/s - consider stationary below this

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useActivityRecording() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    activityType: 'hike',
    startTime: null,
    trackPoints: [],
    stats: initialStats,
    currentPosition: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastValidPointRef = useRef<TrackPoint | null>(null);

  const saveActivityMutation = useMutation({
    mutationFn: async (activity: Omit<InsertActivity, 'userId'>) => {
      const response = await apiRequest('POST', '/api/activities', activity);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      toast({
        title: 'Activity saved!',
        description: 'Your activity has been saved successfully.',
      });
    },
    onError: (error) => {
      console.error('Failed to save activity:', error);
      toast({
        title: 'Save failed',
        description: 'Could not save your activity. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const updateStats = useCallback((trackPoints: TrackPoint[], startTime: Date | null) => {
    if (trackPoints.length === 0 || !startTime) {
      return initialStats;
    }

    let totalDistance = 0;
    let movingTime = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    let maxSpeed = 0;
    let lastAltitude: number | null = null;

    for (let i = 1; i < trackPoints.length; i++) {
      const prev = trackPoints[i - 1];
      const curr = trackPoints[i];

      const dist = calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      totalDistance += dist;

      const timeDiff = (curr.timestamp - prev.timestamp) / 1000;
      const speed = dist / timeDiff;

      if (speed > STATIONARY_SPEED_THRESHOLD) {
        movingTime += timeDiff;
      }

      if (curr.speed !== null && curr.speed > maxSpeed) {
        maxSpeed = curr.speed;
      }

      if (curr.altitude !== null && prev.altitude !== null) {
        const altDiff = curr.altitude - prev.altitude;
        if (altDiff > 0) {
          elevationGain += altDiff;
        } else {
          elevationLoss += Math.abs(altDiff);
        }
      }

      if (curr.altitude !== null) {
        lastAltitude = curr.altitude;
      }
    }

    const elapsedTime = (Date.now() - startTime.getTime()) / 1000;
    const averageSpeed = movingTime > 0 ? totalDistance / movingTime : 0;
    const lastPoint = trackPoints[trackPoints.length - 1];
    const currentSpeed = lastPoint?.speed ?? 0;
    const averagePace = averageSpeed > 0 ? 1000 / averageSpeed : 0;
    const currentPace = currentSpeed > 0 ? 1000 / currentSpeed : 0;

    return {
      distance: totalDistance,
      elapsedTime,
      movingTime,
      averageSpeed,
      maxSpeed,
      currentSpeed,
      averagePace,
      currentPace,
      elevationGain,
      elevationLoss,
      currentAltitude: lastAltitude,
    };
  }, []);

  const handlePositionUpdate = useCallback(
    (position: GeolocationPosition) => {
      const { coords, timestamp } = position;

      if (coords.accuracy > MIN_ACCURACY_THRESHOLD) {
        return;
      }

      const newPoint: TrackPoint = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        altitude: coords.altitude,
        accuracy: coords.accuracy,
        timestamp,
        speed: coords.speed,
      };

      setState((prev) => {
        if (!prev.isRecording || prev.isPaused) {
          return {
            ...prev,
            currentPosition: { latitude: coords.latitude, longitude: coords.longitude },
          };
        }

        const lastPoint = lastValidPointRef.current;
        
        if (lastPoint) {
          const dist = calculateDistance(
            lastPoint.latitude,
            lastPoint.longitude,
            newPoint.latitude,
            newPoint.longitude
          );
          
          if (dist < MIN_DISTANCE_THRESHOLD) {
            return {
              ...prev,
              currentPosition: { latitude: coords.latitude, longitude: coords.longitude },
            };
          }
        }

        lastValidPointRef.current = newPoint;
        const newTrackPoints = [...prev.trackPoints, newPoint];
        const newStats = updateStats(newTrackPoints, prev.startTime);

        return {
          ...prev,
          trackPoints: newTrackPoints,
          stats: newStats,
          currentPosition: { latitude: coords.latitude, longitude: coords.longitude },
        };
      });
    },
    [updateStats]
  );

  const handlePositionError = useCallback(
    (error: GeolocationPositionError) => {
      console.error('GPS error:', error);
      toast({
        title: 'GPS Error',
        description: error.message || 'Unable to get location',
        variant: 'destructive',
      });
    },
    [toast]
  );

  const startRecording = useCallback((activityType: ActivityType) => {
    if (!navigator.geolocation) {
      toast({
        title: 'GPS Not Available',
        description: 'Your device does not support GPS.',
        variant: 'destructive',
      });
      return;
    }

    const startTime = new Date();

    setState({
      isRecording: true,
      isPaused: false,
      activityType,
      startTime,
      trackPoints: [],
      stats: initialStats,
      currentPosition: null,
    });

    lastValidPointRef.current = null;

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    timerRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev.isRecording || prev.isPaused || !prev.startTime) return prev;
        return {
          ...prev,
          stats: {
            ...prev.stats,
            elapsedTime: (Date.now() - prev.startTime.getTime()) / 1000,
          },
        };
      });
    }, 1000);

    toast({
      title: 'Recording started',
      description: `Recording ${activityType} activity`,
    });
  }, [handlePositionUpdate, handlePositionError, toast]);

  const pauseRecording = useCallback(() => {
    setState((prev) => ({ ...prev, isPaused: true }));
    toast({
      title: 'Recording paused',
      description: 'Tap resume to continue',
    });
  }, [toast]);

  const resumeRecording = useCallback(() => {
    setState((prev) => ({ ...prev, isPaused: false }));
    toast({
      title: 'Recording resumed',
      description: 'Activity recording continued',
    });
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isRecording: false,
      isPaused: false,
    }));
  }, []);

  const discardRecording = useCallback(() => {
    stopRecording();
    setState({
      isRecording: false,
      isPaused: false,
      activityType: 'hike',
      startTime: null,
      trackPoints: [],
      stats: initialStats,
      currentPosition: null,
    });
    lastValidPointRef.current = null;
    toast({
      title: 'Activity discarded',
      description: 'Your recording was discarded',
    });
  }, [stopRecording, toast]);

  const saveRecording = useCallback(
    async (name: string, isPublic: boolean = false) => {
      if (state.trackPoints.length < 2) {
        toast({
          title: 'Not enough data',
          description: 'Record more track points before saving',
          variant: 'destructive',
        });
        return null;
      }

      const pathCoordinates = state.trackPoints.map((p) => [p.longitude, p.latitude]);

      const activity: Omit<InsertActivity, 'userId'> = {
        name,
        activityType: state.activityType,
        startTime: state.startTime!,
        endTime: new Date(),
        elapsedTimeSeconds: Math.round(state.stats.elapsedTime),
        movingTimeSeconds: Math.round(state.stats.movingTime),
        distanceMeters: state.stats.distance.toFixed(2),
        avgSpeedMps: state.stats.averageSpeed.toFixed(4),
        maxSpeedMps: state.stats.maxSpeed.toFixed(4),
        paceSecondsPerMile: Math.round(state.stats.averagePace * 1.60934),
        elevationGainMeters: state.stats.elevationGain.toFixed(2),
        elevationLossMeters: state.stats.elevationLoss.toFixed(2),
        pathCoordinates: JSON.stringify(pathCoordinates),
        trackPoints: JSON.stringify(state.trackPoints),
        isPublic,
      };

      try {
        const result = await saveActivityMutation.mutateAsync(activity);
        stopRecording();
        setState({
          isRecording: false,
          isPaused: false,
          activityType: 'hike',
          startTime: null,
          trackPoints: [],
          stats: initialStats,
          currentPosition: null,
        });
        lastValidPointRef.current = null;
        return result as Activity;
      } catch (error) {
        return null;
      }
    },
    [state, saveActivityMutation, stopRecording, toast]
  );

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    saveRecording,
    isSaving: saveActivityMutation.isPending,
  };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatPace(secondsPerKm: number): string {
  if (!isFinite(secondsPerKm) || secondsPerKm === 0) {
    return '--:--';
  }
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.floor(secondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatSpeed(metersPerSecond: number): string {
  const kmh = metersPerSecond * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

export function formatElevation(meters: number): string {
  const feet = meters * 3.28084;
  return `${Math.round(feet)} ft`;
}
