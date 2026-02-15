import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X, Plus, Trash2, Save, Undo2, Route as RouteIcon, MapPin, Mountain, Ruler, Clock } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Route } from '@shared/schema';

interface CesiumRouteBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  viewer: any;
  cesiumTilesetId: number;
  editingRoute?: Route | null;
  onRouteSaved?: (route: Route) => void;
}

interface WaypointData {
  name: string;
  lngLat: [number, number];
  elevation: number;
  cartesian: any;
}

function formatDistanceDisplay(meters: number): string {
  const miles = meters / 1609.34;
  if (miles >= 0.1) {
    return `${miles.toFixed(2)} mi`;
  }
  const feet = meters * 3.28084;
  return `${feet.toFixed(0)} ft`;
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins}m`;
}

export default function CesiumRouteBuilder({
  isOpen,
  onClose,
  viewer,
  cesiumTilesetId,
  editingRoute,
  onRouteSaved,
}: CesiumRouteBuilderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [waypoints, setWaypoints] = useState<WaypointData[]>([]);
  const entitiesRef = useRef<any[]>([]);
  const polylineEntityRef = useRef<any>(null);
  const handlerRef = useRef<any>(null);

  const Cesium = (window as any).Cesium;

  const removeAllEntities = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;
    entitiesRef.current.forEach((entity) => {
      try { viewer.entities.remove(entity); } catch {}
    });
    entitiesRef.current = [];
    if (polylineEntityRef.current) {
      try { viewer.entities.remove(polylineEntityRef.current); } catch {}
      polylineEntityRef.current = null;
    }
    viewer.scene.requestRender();
  }, [viewer]);

  const updatePolyline = useCallback((wps: WaypointData[]) => {
    if (!viewer || !Cesium || viewer.isDestroyed()) return;
    if (polylineEntityRef.current) {
      try { viewer.entities.remove(polylineEntityRef.current); } catch {}
      polylineEntityRef.current = null;
    }
    if (wps.length < 2) return;
    const positions = wps.map(w => w.cartesian);
    polylineEntityRef.current = viewer.entities.add({
      polyline: {
        positions,
        width: 4,
        material: Cesium.Color.fromCssColorString('#FF6B35'),
        clampToGround: false,
        depthFailMaterial: Cesium.Color.fromCssColorString('#FF6B35').withAlpha(0.5),
      },
    });
    viewer.scene.requestRender();
  }, [viewer, Cesium]);

  const addWaypointEntity = useCallback((wp: WaypointData, index: number) => {
    if (!viewer || !Cesium || viewer.isDestroyed()) return;
    const entity = viewer.entities.add({
      position: wp.cartesian,
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#FF6B35'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: String(index + 1),
        font: 'bold 14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    entitiesRef.current.push(entity);
    viewer.scene.requestRender();
  }, [viewer, Cesium]);

  const rebuildEntities = useCallback((wps: WaypointData[]) => {
    removeAllEntities();
    wps.forEach((wp, i) => addWaypointEntity(wp, i));
    updatePolyline(wps);
  }, [removeAllEntities, addWaypointEntity, updatePolyline]);

  const calculateStats = useCallback((wps: WaypointData[]) => {
    if (!Cesium || wps.length < 2) return { totalDistance: 0, elevationGain: 0, elevationLoss: 0, estimatedTime: 0 };
    let totalDistance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    for (let i = 1; i < wps.length; i++) {
      totalDistance += Cesium.Cartesian3.distance(wps[i - 1].cartesian, wps[i].cartesian);
      const diff = wps[i].elevation - wps[i - 1].elevation;
      if (diff > 0) elevationGain += diff;
      else elevationLoss += Math.abs(diff);
    }
    const estimatedTime = Math.round(totalDistance / 83.33);
    return { totalDistance, elevationGain, elevationLoss, estimatedTime };
  }, [Cesium]);

  useEffect(() => {
    if (!isOpen || !viewer || !Cesium || viewer.isDestroyed()) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((click: any) => {
      let position: any = null;
      const picked = viewer.scene.pick(click.position);
      if (picked && Cesium.defined(picked)) {
        position = viewer.scene.pickPosition(click.position);
      }
      if (!position) {
        position = viewer.scene.pickPosition(click.position);
      }
      if (!position) return;

      const carto = Cesium.Cartographic.fromCartesian(position);
      const lng = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const elevation = carto.height;

      const newWp: WaypointData = {
        name: `Waypoint ${0}`,
        lngLat: [lng, lat],
        elevation,
        cartesian: position,
      };

      setWaypoints((prev) => {
        const idx = prev.length;
        newWp.name = `Waypoint ${idx + 1}`;
        const updated = [...prev, newWp];
        addWaypointEntity(newWp, idx);
        updatePolyline(updated);
        return updated;
      });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      handlerRef.current = null;
    };
  }, [isOpen, viewer, Cesium, addWaypointEntity, updatePolyline]);

  useEffect(() => {
    if (!isOpen || !editingRoute || !Cesium) return;
    try {
      const wpCoords = editingRoute.waypointCoordinates
        ? JSON.parse(editingRoute.waypointCoordinates)
        : [];
      if (wpCoords.length === 0) return;

      setName(editingRoute.name);
      setDescription(editingRoute.description || '');

      const loadedWps: WaypointData[] = wpCoords.map((w: any, i: number) => {
        const elev = w.elevation ?? 0;
        const cartesian = Cesium.Cartesian3.fromDegrees(w.lngLat[0], w.lngLat[1], elev);
        return {
          name: w.name || `Waypoint ${i + 1}`,
          lngLat: w.lngLat as [number, number],
          elevation: elev,
          cartesian,
        };
      });

      setWaypoints(loadedWps);
      setTimeout(() => rebuildEntities(loadedWps), 100);
    } catch (e) {
      console.error('Failed to load editing route waypoints:', e);
    }
  }, [isOpen, editingRoute, Cesium, rebuildEntities]);

  useEffect(() => {
    if (!isOpen) {
      removeAllEntities();
      setWaypoints([]);
      setName('');
      setDescription('');
    }
  }, [isOpen, removeAllEntities]);

  useEffect(() => {
    return () => {
      removeAllEntities();
      if (handlerRef.current) {
        try { handlerRef.current.destroy(); } catch {}
        handlerRef.current = null;
      }
    };
  }, [removeAllEntities]);

  const handleDeleteWaypoint = useCallback((index: number) => {
    setWaypoints((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      rebuildEntities(updated);
      return updated;
    });
  }, [rebuildEntities]);

  const handleUndoLast = useCallback(() => {
    setWaypoints((prev) => {
      if (prev.length === 0) return prev;
      const updated = prev.slice(0, -1);
      rebuildEntities(updated);
      return updated;
    });
  }, [rebuildEntities]);

  const handleClearAll = useCallback(() => {
    setWaypoints([]);
    removeAllEntities();
  }, [removeAllEntities]);

  const handleWaypointNameChange = useCallback((index: number, newName: string) => {
    setWaypoints((prev) =>
      prev.map((wp, i) => (i === index ? { ...wp, name: newName } : wp))
    );
  }, []);

  const createRouteMutation = useMutation({
    mutationFn: async (routeData: any) => {
      const res = await apiRequest('POST', '/api/routes', routeData);
      return await res.json();
    },
    onSuccess: (savedRoute: Route) => {
      queryClient.invalidateQueries({ queryKey: ['/api/routes'] });
      toast({ title: 'Route saved', description: 'Your 3D route has been saved successfully.' });
      onRouteSaved?.(savedRoute);
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving route', description: error.message, variant: 'destructive' });
    },
  });

  const updateRouteMutation = useMutation({
    mutationFn: async (routeData: any) => {
      const res = await apiRequest('PUT', `/api/routes/${editingRoute?.id}`, routeData);
      return await res.json();
    },
    onSuccess: (updatedRoute: Route) => {
      queryClient.invalidateQueries({ queryKey: ['/api/routes'] });
      toast({ title: 'Route updated', description: 'Your 3D route has been updated successfully.' });
      onRouteSaved?.(updatedRoute);
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating route', description: error.message, variant: 'destructive' });
    },
  });

  const handleSave = useCallback(() => {
    if (!name.trim() || waypoints.length < 2) return;

    const stats = calculateStats(waypoints);
    const pathCoordinates = waypoints.map((w) => w.lngLat);
    const waypointCoordinates = waypoints.map((w) => ({
      name: w.name,
      lngLat: w.lngLat,
      elevation: w.elevation,
    }));

    const routeData = {
      name: name.trim(),
      description: description.trim() || null,
      waypointIds: '[]',
      pathCoordinates: JSON.stringify(pathCoordinates),
      waypointCoordinates: JSON.stringify(waypointCoordinates),
      totalDistance: stats.totalDistance,
      elevationGain: stats.elevationGain,
      elevationLoss: stats.elevationLoss,
      estimatedTime: stats.estimatedTime,
      routingMode: 'direct',
      cesiumTilesetId,
    };

    if (editingRoute) {
      updateRouteMutation.mutate(routeData);
    } else {
      createRouteMutation.mutate(routeData);
    }
  }, [name, description, waypoints, cesiumTilesetId, editingRoute, calculateStats, createRouteMutation, updateRouteMutation]);

  const stats = calculateStats(waypoints);
  const canSave = name.trim().length > 0 && waypoints.length >= 2;
  const isSaving = createRouteMutation.isPending || updateRouteMutation.isPending;

  if (!isOpen) return null;

  return (
    <div className="absolute left-4 top-20 bottom-20 w-80 z-40 pointer-events-auto flex flex-col bg-gray-900/90 backdrop-blur-sm border border-white/20 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <RouteIcon className="w-5 h-5 text-[#FF6B35]" />
          <h3 className="text-white font-semibold text-sm">
            {editingRoute ? 'Edit 3D Route' : 'Build 3D Route'}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div>
          <label className="text-white/70 text-xs font-medium mb-1 block">Route Name *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter route name"
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40 h-9 text-sm"
          />
        </div>

        <div>
          <label className="text-white/70 text-xs font-medium mb-1 block">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40 text-sm min-h-[60px] resize-none"
          />
        </div>

        <div className="bg-white/5 rounded-md px-3 py-2">
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <RouteIcon className="w-3 h-3" />
            <span>Mode: Direct (3D lines)</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-white/70 text-xs font-medium flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              Waypoints ({waypoints.length})
            </label>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-white/60 hover:text-white hover:bg-white/10"
                onClick={handleUndoLast}
                disabled={waypoints.length === 0}
              >
                <Undo2 className="w-3 h-3 mr-1" />
                Undo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-red-400/80 hover:text-red-400 hover:bg-red-400/10"
                onClick={handleClearAll}
                disabled={waypoints.length === 0}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear
              </Button>
            </div>
          </div>

          {waypoints.length === 0 ? (
            <div className="bg-white/5 rounded-md px-3 py-4 text-center">
              <Plus className="w-5 h-5 text-white/30 mx-auto mb-1" />
              <p className="text-white/40 text-xs">Click on the 3D map to place waypoints</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {waypoints.map((wp, index) => (
                <div
                  key={index}
                  className="bg-white/5 rounded-md px-2.5 py-2 flex items-start gap-2"
                >
                  <span className="text-[#FF6B35] font-bold text-xs mt-1 min-w-[16px]">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Input
                      value={wp.name}
                      onChange={(e) => handleWaypointNameChange(index, e.target.value)}
                      className="bg-transparent border-none text-white text-xs h-5 p-0 focus-visible:ring-0"
                    />
                    <p className="text-white/40 text-[10px] mt-0.5">
                      {wp.lngLat[1].toFixed(6)}, {wp.lngLat[0].toFixed(6)} · {wp.elevation.toFixed(1)}m
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-white/30 hover:text-red-400 hover:bg-red-400/10 shrink-0"
                    onClick={() => handleDeleteWaypoint(index)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {waypoints.length >= 2 && (
          <div className="bg-white/5 rounded-md px-3 py-2.5 space-y-1.5">
            <h4 className="text-white/70 text-xs font-medium mb-1">Route Stats</h4>
            <div className="flex items-center gap-2 text-white text-xs">
              <Ruler className="w-3 h-3 text-[#FF6B35]" />
              <span>Distance: {formatDistanceDisplay(stats.totalDistance)}</span>
            </div>
            <div className="flex items-center gap-2 text-white text-xs">
              <Mountain className="w-3 h-3 text-green-400" />
              <span>Gain: {stats.elevationGain.toFixed(1)}m · Loss: {stats.elevationLoss.toFixed(1)}m</span>
            </div>
            <div className="flex items-center gap-2 text-white text-xs">
              <Clock className="w-3 h-3 text-blue-400" />
              <span>Est. Time: {formatTime(stats.estimatedTime)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/10 space-y-2">
        <Button
          className="w-full bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white text-sm h-9"
          onClick={handleSave}
          disabled={!canSave || isSaving}
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Saving...' : editingRoute ? 'Update Route' : 'Save Route'}
        </Button>
        <Button
          variant="ghost"
          className="w-full text-white/60 hover:text-white hover:bg-white/10 text-sm h-9"
          onClick={onClose}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
