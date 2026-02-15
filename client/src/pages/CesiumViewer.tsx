import { useEffect, useRef, useState, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Ruler,
  MapPin,
  Navigation,
  Minus,
  Plus,
  RotateCcw,
  Compass,
  Layers,
  X,
  Maximize
} from 'lucide-react';

interface Cesium3dTileset {
  id: number;
  droneImageId: number | null;
  name: string;
  storagePath: string;
  tilesetJsonUrl: string;
  sizeInMB: number;
  centerLat: string;
  centerLng: string;
  centerAlt: string | null;
  boundingVolume: string | null;
  uploadedAt: string;
  userId: number;
}

let Cesium: any = null;

async function loadCesium(): Promise<any> {
  if (Cesium) return Cesium;

  return new Promise((resolve, reject) => {
    if ((window as any).Cesium) {
      Cesium = (window as any).Cesium;
      resolve(Cesium);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cesium.com/downloads/cesiumjs/releases/1.121/Build/Cesium/Widgets/widgets.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cesium.com/downloads/cesiumjs/releases/1.121/Build/Cesium/Cesium.js';
    script.onload = () => {
      Cesium = (window as any).Cesium;
      resolve(Cesium);
    };
    script.onerror = () => reject(new Error('Failed to load CesiumJS'));
    document.head.appendChild(script);
  });
}

function formatDistance(meters: number): string {
  if (meters >= 1609.34) {
    return `${(meters / 1609.34).toFixed(2)} mi`;
  }
  if (meters >= 1) {
    return `${meters.toFixed(1)} m`;
  }
  return `${(meters * 100).toFixed(1)} cm`;
}

export default function CesiumViewer() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/cesium/:id");
  const { user } = useAuth();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const tilesetRef = useRef<any>(null);
  const gpsEntityRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const measurePointsRef = useRef<any[]>([]);
  const measureEntitiesRef = useRef<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tilesLoading, setTilesLoading] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number; alt: number | null } | null>(null);

  const tilesetId = params?.id ? parseInt(params.id) : null;

  const { data: tileset, isLoading: isFetching } = useQuery<Cesium3dTileset>({
    queryKey: ['/api/cesium-tilesets', tilesetId],
    queryFn: async () => {
      const res = await fetch(`/api/cesium-tilesets/${tilesetId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load tileset');
      return res.json();
    },
    enabled: !!tilesetId
  });

  useEffect(() => {
    if (!containerRef.current || !tileset) return;

    let viewer: any = null;

    const initCesium = async () => {
      try {
        const C = await loadCesium();

        C.Ion.defaultAccessToken = undefined;

        viewer = new C.Viewer(containerRef.current, {
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          animation: false,
          fullscreenButton: false,
          vrButton: false,
          navigationHelpButton: false,
          infoBox: false,
          creditContainer: document.createElement('div'),
          imageryProvider: false,
          terrainProvider: new C.EllipsoidTerrainProvider(),
          skyBox: false,
          skyAtmosphere: false,
          contextOptions: {
            webgl: {
              alpha: true,
            },
          },
        });

        viewer.scene.backgroundColor = C.Color.fromCssColorString('#1a1a2e');
        viewer.scene.globe.show = false;
        if (viewer.scene.sun) viewer.scene.sun.show = false;
        if (viewer.scene.moon) viewer.scene.moon.show = false;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;

        viewerRef.current = viewer;

        const tilesetUrl = tileset.tilesetJsonUrl;
        const loadedTileset = await C.Cesium3DTileset.fromUrl(tilesetUrl, {
          maximumScreenSpaceError: 16,
          maximumMemoryUsage: 512,
        });

        viewer.scene.primitives.add(loadedTileset);
        tilesetRef.current = loadedTileset;

        setTilesLoading(true);
        loadedTileset.allTilesLoaded.addEventListener(() => {
          setTilesLoading(false);
        });
        loadedTileset.loadProgress.addEventListener((numberOfPendingRequests: number, numberOfTilesProcessing: number) => {
          if (numberOfPendingRequests > 0 || numberOfTilesProcessing > 0) {
            setTilesLoading(true);
          }
        });

        await viewer.zoomTo(loadedTileset);

        viewer.scene.requestRender();

        setIsLoading(false);
      } catch (err: any) {
        console.error('Cesium initialization error:', err);
        setError(err.message || 'Failed to initialize 3D viewer');
        setIsLoading(false);
      }
    };

    initCesium();

    return () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
      tilesetRef.current = null;
    };
  }, [tileset]);

  const handleMeasureClick = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !Cesium) return;

    if (isMeasuring) {
      measureEntitiesRef.current.forEach(entity => viewer.entities.remove(entity));
      measureEntitiesRef.current = [];
      measurePointsRef.current = [];
      setMeasureDistance(null);
      setIsMeasuring(false);
      return;
    }

    setIsMeasuring(true);
    measurePointsRef.current = [];
    measureEntitiesRef.current = [];
    setMeasureDistance(null);
  }, [isMeasuring]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !Cesium || !isMeasuring) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((click: any) => {
      const ray = viewer.camera.getPickRay(click.position);
      if (!ray) return;

      let position: any;
      const pickedObject = viewer.scene.pick(click.position);
      if (pickedObject && Cesium.defined(pickedObject)) {
        position = viewer.scene.pickPosition(click.position);
      } else {
        position = viewer.scene.globe.pick(ray, viewer.scene);
      }

      if (!position) return;

      measurePointsRef.current.push(position);

      const pointEntity = viewer.entities.add({
        position: position,
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString('#FF6B35'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: String(measurePointsRef.current.length),
          font: '14px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -15),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
      });
      measureEntitiesRef.current.push(pointEntity);

      if (measurePointsRef.current.length >= 2) {
        const points = measurePointsRef.current;
        const lastTwo = [points[points.length - 2], points[points.length - 1]];

        const lineEntity = viewer.entities.add({
          polyline: {
            positions: lastTwo,
            width: 3,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString('#FF6B35'),
              dashLength: 16,
            }),
            clampToGround: false,
            depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString('#FF6B35').withAlpha(0.5),
              dashLength: 16,
            }),
          }
        });
        measureEntitiesRef.current.push(lineEntity);

        let totalDist = 0;
        for (let i = 1; i < points.length; i++) {
          totalDist += Cesium.Cartesian3.distance(points[i - 1], points[i]);
        }
        setMeasureDistance(totalDist);
      }

      viewer.scene.requestRender();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [isMeasuring]);

  const toggleGps = useCallback(() => {
    if (gpsActive) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (viewerRef.current && gpsEntityRef.current) {
        viewerRef.current.entities.remove(gpsEntityRef.current);
        gpsEntityRef.current = null;
      }
      setGpsActive(false);
      setGpsPosition(null);
      return;
    }

    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    setGpsActive(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, altitude } = position.coords;
        setGpsPosition({ lat: latitude, lng: longitude, alt: altitude });

        if (!viewerRef.current || !Cesium) return;

        const cartesian = Cesium.Cartesian3.fromDegrees(
          longitude,
          latitude,
          (altitude || 0) + 2
        );

        if (gpsEntityRef.current) {
          gpsEntityRef.current.position = cartesian;
        } else {
          gpsEntityRef.current = viewerRef.current.entities.add({
            position: cartesian,
            point: {
              pixelSize: 16,
              color: Cesium.Color.fromCssColorString('#3b82f6'),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 3,
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: 'You',
              font: 'bold 12px sans-serif',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.fromCssColorString('#3b82f6'),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -20),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
          });
        }

        viewerRef.current.scene.requestRender();
      },
      (err) => {
        console.error('GPS error:', err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [gpsActive]);

  const flyToGps = useCallback(() => {
    if (!gpsPosition || !viewerRef.current || !Cesium) return;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        gpsPosition.lng,
        gpsPosition.lat,
        (gpsPosition.alt || 0) + 200
      ),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 1.5,
    });
  }, [gpsPosition]);

  const resetView = useCallback(() => {
    if (!viewerRef.current || !tilesetRef.current) return;
    viewerRef.current.zoomTo(tilesetRef.current);
  }, []);

  const zoomIn = useCallback(() => {
    if (!viewerRef.current) return;
    viewerRef.current.camera.zoomIn(viewerRef.current.camera.positionCartographic.height * 0.3);
    viewerRef.current.scene.requestRender();
  }, []);

  const zoomOut = useCallback(() => {
    if (!viewerRef.current) return;
    viewerRef.current.camera.zoomOut(viewerRef.current.camera.positionCartographic.height * 0.3);
    viewerRef.current.scene.requestRender();
  }, []);

  const lookNorth = useCallback(() => {
    if (!viewerRef.current || !Cesium) return;
    const camera = viewerRef.current.camera;
    const center = viewerRef.current.scene.globe.pick(
      camera.getPickRay(new Cesium.Cartesian2(
        viewerRef.current.canvas.clientWidth / 2,
        viewerRef.current.canvas.clientHeight / 2
      )),
      viewerRef.current.scene
    );
    if (center) {
      const distance = Cesium.Cartesian3.distance(camera.positionWC, center);
      camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          Cesium.Math.toDegrees(camera.positionCartographic.longitude),
          Cesium.Math.toDegrees(camera.positionCartographic.latitude),
          camera.positionCartographic.height
        ),
        orientation: {
          heading: 0,
          pitch: camera.pitch,
          roll: 0,
        },
        duration: 0.5,
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  if (isFetching) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-lg">Loading 3D tileset info...</div>
      </div>
    );
  }

  if (!tileset) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">3D tileset not found</p>
          <Button onClick={() => setLocation("/")} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen relative bg-gray-900 overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {(isLoading || error) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-50">
          {isLoading && !error && (
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white text-lg">Loading 3D Map...</p>
              <p className="text-white/60 text-sm mt-1">{tileset.name}</p>
            </div>
          )}
          {error && (
            <div className="text-center">
              <p className="text-red-400 text-lg mb-4">{error}</p>
              <Button onClick={() => setLocation("/")} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="absolute top-4 left-4 z-40 flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="bg-gray-900/80 border-white/20 text-white hover:bg-gray-800"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="bg-gray-900/80 border border-white/20 rounded-md px-3 py-1.5">
          <h2 className="text-white text-sm font-medium">{tileset.name}</h2>
          <p className="text-white/50 text-xs">3D Tileset</p>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-40 flex flex-col gap-2">
        <Button
          variant="outline"
          size="icon"
          className={`w-10 h-10 bg-gray-900/80 border-white/20 text-white hover:bg-gray-800 ${isMeasuring ? 'ring-2 ring-orange-400 border-orange-400' : ''}`}
          onClick={handleMeasureClick}
          title={isMeasuring ? 'Stop measuring' : 'Measure distance'}
        >
          {isMeasuring ? <X className="w-5 h-5" /> : <Ruler className="w-5 h-5" />}
        </Button>

        <Button
          variant="outline"
          size="icon"
          className={`w-10 h-10 bg-gray-900/80 border-white/20 text-white hover:bg-gray-800 ${gpsActive ? 'ring-2 ring-blue-400 border-blue-400' : ''}`}
          onClick={toggleGps}
          title={gpsActive ? 'Disable GPS' : 'Enable GPS'}
        >
          <Navigation className={`w-5 h-5 ${gpsActive ? 'text-blue-400' : ''}`} />
        </Button>

        {gpsActive && gpsPosition && (
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-10 bg-gray-900/80 border-white/20 text-white hover:bg-gray-800"
            onClick={flyToGps}
            title="Fly to GPS location"
          >
            <MapPin className="w-5 h-5 text-blue-400" />
          </Button>
        )}

        <div className="border-t border-white/10 pt-2 flex flex-col gap-2">
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-10 bg-gray-900/80 border-white/20 text-white hover:bg-gray-800"
            onClick={zoomIn}
            title="Zoom in"
          >
            <Plus className="w-5 h-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-10 bg-gray-900/80 border-white/20 text-white hover:bg-gray-800"
            onClick={zoomOut}
            title="Zoom out"
          >
            <Minus className="w-5 h-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-10 bg-gray-900/80 border-white/20 text-white hover:bg-gray-800"
            onClick={resetView}
            title="Reset view"
          >
            <RotateCcw className="w-5 h-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-10 bg-gray-900/80 border-white/20 text-white hover:bg-gray-800"
            onClick={lookNorth}
            title="Look north"
          >
            <Compass className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {tilesLoading && !isLoading && !error && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
          <div className="bg-black/60 backdrop-blur-sm rounded-xl px-6 py-4 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
            <span className="text-white text-sm font-medium">Loading imagery...</span>
          </div>
        </div>
      )}

      {isMeasuring && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-gray-900/90 border border-orange-400/50 rounded-lg px-4 py-3 text-center">
            <p className="text-orange-300 text-xs font-medium mb-1">MEASURE MODE</p>
            {measureDistance !== null ? (
              <p className="text-white text-lg font-bold">{formatDistance(measureDistance)}</p>
            ) : (
              <p className="text-white/70 text-sm">Click points on the 3D map to measure</p>
            )}
            <p className="text-white/40 text-xs mt-1">
              {measurePointsRef.current.length} point{measurePointsRef.current.length !== 1 ? 's' : ''} placed
            </p>
          </div>
        </div>
      )}

      {gpsActive && gpsPosition && (
        <div className="absolute bottom-6 right-4 z-40">
          <div className="bg-gray-900/90 border border-blue-400/50 rounded-lg px-3 py-2">
            <p className="text-blue-300 text-xs font-medium">GPS ACTIVE</p>
            <p className="text-white text-xs mt-0.5">
              {gpsPosition.lat.toFixed(6)}, {gpsPosition.lng.toFixed(6)}
            </p>
            {gpsPosition.alt !== null && (
              <p className="text-white/60 text-xs">Alt: {gpsPosition.alt.toFixed(1)}m</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
