import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useActivityRecording, formatDuration, formatDistance, formatPace, formatSpeed, formatElevation, ActivityType } from "@/hooks/useActivityRecording";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Timer,
  Route as RouteIcon,
  TrendingUp,
  Gauge,
  Mountain,
  Footprints,
  Bike,
  Snowflake,
  PersonStanding,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const activityTypes: { type: ActivityType; label: string; icon: React.ReactNode }[] = [
  { type: "run", label: "Run", icon: <Footprints className="w-6 h-6" /> },
  { type: "hike", label: "Hike", icon: <PersonStanding className="w-6 h-6" /> },
  { type: "bike", label: "Bike", icon: <Bike className="w-6 h-6" /> },
  { type: "ski", label: "Ski", icon: <Snowflake className="w-6 h-6" /> },
];

export default function RecordActivity() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const {
    isRecording,
    isPaused,
    activityType,
    stats,
    trackPoints,
    currentPosition,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    saveRecording,
    isSaving,
  } = useActivityRecording();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [activityName, setActivityName] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-110.8, 43.5],
      zoom: 13,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      map.current!.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [],
          },
        },
      });

      map.current!.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#22c55e",
          "line-width": 4,
        },
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current || !currentPosition) return;

    if (!userMarker.current) {
      const el = document.createElement("div");
      el.className = "user-location-marker";
      el.innerHTML = `
        <div style="
          width: 20px;
          height: 20px;
          background: #3b82f6;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        "></div>
      `;

      userMarker.current = new mapboxgl.Marker({ element: el })
        .setLngLat([currentPosition.longitude, currentPosition.latitude])
        .addTo(map.current);

      map.current.flyTo({
        center: [currentPosition.longitude, currentPosition.latitude],
        zoom: 16,
      });
    } else {
      userMarker.current.setLngLat([currentPosition.longitude, currentPosition.latitude]);
    }
  }, [currentPosition]);

  useEffect(() => {
    if (!map.current) return;

    const source = map.current.getSource("route") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const coordinates = trackPoints.map((p) => [p.longitude, p.latitude]);

    source.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates,
      },
    });
  }, [trackPoints]);

  const handleStart = (type: ActivityType) => {
    startRecording(type);
  };

  const handleStop = () => {
    stopRecording();
    setShowSaveDialog(true);
    setActivityName(`${activityType.charAt(0).toUpperCase() + activityType.slice(1)} - ${new Date().toLocaleDateString()}`);
  };

  const handleSave = async () => {
    if (!activityName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for your activity",
        variant: "destructive",
      });
      return;
    }

    const result = await saveRecording(activityName, isPublic);
    if (result) {
      setShowSaveDialog(false);
      setLocation(`/activities/${result.id}`);
    }
  };

  const handleDiscard = () => {
    setShowSaveDialog(false);
    discardRecording();
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-white">Please log in to record activities</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      <div className="flex items-center justify-between p-4 bg-slate-800">
        <Button
          variant="ghost"
          size="icon"
          className="text-white"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold text-white">
          {isRecording ? `Recording ${activityType}` : "Record Activity"}
        </h1>
        <div className="w-10" />
      </div>

      <div ref={mapContainer} className="flex-1" />

      {!isRecording ? (
        <div className="p-4 bg-slate-800">
          <h2 className="text-white text-center mb-4 font-medium">Select Activity Type</h2>
          <div className="grid grid-cols-4 gap-2">
            {activityTypes.map(({ type, label, icon }) => (
              <Button
                key={type}
                variant="outline"
                className="flex flex-col items-center p-4 h-auto bg-slate-700 border-slate-600 hover:bg-green-600 hover:border-green-500"
                onClick={() => handleStart(type)}
              >
                {icon}
                <span className="mt-2 text-sm">{label}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 p-4 bg-slate-800">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1">
                <Timer className="w-3 h-3" /> Time
              </div>
              <div className="text-2xl font-mono font-bold text-white">
                {formatDuration(stats.elapsedTime)}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1">
                <RouteIcon className="w-3 h-3" /> Distance
              </div>
              <div className="text-2xl font-mono font-bold text-white">
                {formatDistance(stats.distance)}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1">
                <TrendingUp className="w-3 h-3" /> Pace
              </div>
              <div className="text-2xl font-mono font-bold text-white">
                {formatPace(stats.averagePace)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 p-4 pt-0 bg-slate-800">
            <div className="text-center">
              <div className="text-slate-400 text-xs mb-1">Speed</div>
              <div className="text-sm font-semibold text-white">
                {formatSpeed(stats.currentSpeed)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs mb-1">Max Speed</div>
              <div className="text-sm font-semibold text-white">
                {formatSpeed(stats.maxSpeed)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs mb-1">Elev Gain</div>
              <div className="text-sm font-semibold text-white">
                {formatElevation(stats.elevationGain)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs mb-1">Elev Loss</div>
              <div className="text-sm font-semibold text-white">
                {formatElevation(stats.elevationLoss)}
              </div>
            </div>
          </div>

          <div className="flex gap-4 p-4 pt-0 bg-slate-800 justify-center">
            <Button
              size="lg"
              variant="destructive"
              className="w-16 h-16 rounded-full"
              onClick={handleStop}
            >
              <Square className="w-6 h-6" />
            </Button>
            
            {isPaused ? (
              <Button
                size="lg"
                className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700"
                onClick={resumeRecording}
              >
                <Play className="w-6 h-6" />
              </Button>
            ) : (
              <Button
                size="lg"
                variant="secondary"
                className="w-16 h-16 rounded-full"
                onClick={pauseRecording}
              >
                <Pause className="w-6 h-6" />
              </Button>
            )}
          </div>
        </>
      )}

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="bg-slate-800 text-white border-slate-700">
          <DialogHeader>
            <DialogTitle>Save Activity</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-slate-400 text-xs">Distance</div>
                <div className="text-lg font-semibold">{formatDistance(stats.distance)}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs">Time</div>
                <div className="text-lg font-semibold">{formatDuration(stats.elapsedTime)}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs">Avg Pace</div>
                <div className="text-lg font-semibold">{formatPace(stats.averagePace)} /km</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Activity Name</Label>
              <Input
                id="name"
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                placeholder="Enter activity name"
                className="bg-slate-700 border-slate-600"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="public">Make Public</Label>
              <Switch
                id="public"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleDiscard}
              className="border-slate-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Discard
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
