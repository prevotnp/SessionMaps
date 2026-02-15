import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ChevronLeft, 
  User, 
  MapPin, 
  Download, 
  Cloud, 
  LogOut,
  Settings
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { DroneImage, OfflineMapArea } from '@shared/schema';

const Profile: React.FC = () => {
  const { user, logout } = useContext(AuthContext);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!user && !isLoggingOut) {
      navigate('/login');
    }
  }, [user, navigate, isLoggingOut]);

  // Get user's drone images
  const { data: droneImages, isLoading: isDroneLoading } = useQuery<DroneImage[]>({
    queryKey: ['/api/drone-images/user'],
    enabled: !!user
  });

  // Get user's offline map areas
  const { data: offlineMaps, isLoading: isOfflineLoading } = useQuery<OfflineMapArea[]>({
    queryKey: ['/api/offline-maps'],
    enabled: !!user
  });

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
        variant: "success",
      });
      navigate('/login');
    } catch (error) {
      toast({
        title: "Logout failed",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
      setIsLoggingOut(false);
    }
  };

  if (!user) {
    return null; // Will redirect to login
  }

  const userInitials = user.fullName
    ? user.fullName.split(' ').map(name => name[0]).join('').toUpperCase()
    : user.username.substring(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* iOS Status Bar - Just for design purposes */}
      <div className="ios-status-bar bg-black flex items-center justify-between px-4 pt-2">
        <div className="text-sm">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="flex items-center space-x-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17.778 8.222c-4.296-4.296-11.26-4.296-15.556 0A1 1 0 01.808 6.808c5.076-5.077 13.308-5.077 18.384 0a1 1 0 01-1.414 1.414zM14.95 11.05a7 7 0 00-9.9 0 1 1 0 01-1.414-1.414 9 9 0 0112.728 0 1 1 0 01-1.414 1.414zM12.12 13.88a3 3 0 00-4.242 0 1 1 0 01-1.415-1.415 5 5 0 017.072 0 1 1 0 01-1.415 1.415zM9 16a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
        </div>
      </div>

      {/* Profile Header */}
      <div className="relative">
        <div className="flex justify-between items-center p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-xl font-semibold">Profile</h1>
          <Button variant="ghost" size="icon">
            <Settings className="h-6 w-6" />
          </Button>
        </div>
        
        <div className="flex flex-col items-center p-6 pb-10">
          <Avatar className="h-24 w-24 mb-4">
            <AvatarImage src={`https://api.dicebear.com/6.x/initials/svg?seed=${user.username}`} alt={user.username} />
            <AvatarFallback className="text-2xl bg-primary text-white">{userInitials}</AvatarFallback>
          </Avatar>
          <h2 className="text-xl font-bold">{user.fullName || user.username}</h2>
          <p className="text-muted-foreground mb-2">{user.email}</p>
          
        </div>
      </div>

      {/* Profile Content */}
      <div className="px-4 space-y-4 mb-24">

        {/* Drone Imagery Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Cloud className="h-5 w-5 mr-2 text-primary" />
              My Drone Imagery
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isDroneLoading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : droneImages && droneImages.length > 0 ? (
              <div className="space-y-3">
                {droneImages.slice(0, 2).map(image => (
                  <div key={image.id} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div 
                        className="w-10 h-10 rounded bg-gray-700 mr-3"
                        style={{
                          backgroundImage: `url('https://images.unsplash.com/photo-${image.id % 3 === 0 ? '1552083375-1447ce886485' : '1520962880247-cfaf541c8724'}?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100')`,
                          backgroundSize: 'cover'
                        }}
                      />
                      <div>
                        <div className="font-medium text-sm">{image.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(new Date(image.capturedAt))}
                        </div>
                      </div>
                    </div>
                    {image.isActive && (
                      <span className="text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                ))}
                {droneImages.length > 2 && (
                  <Button variant="outline" size="sm" className="w-full">
                    View All ({droneImages.length})
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Cloud className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>No drone imagery added yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Offline Maps Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Download className="h-5 w-5 mr-2 text-primary" />
              Offline Map Areas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isOfflineLoading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : offlineMaps && offlineMaps.length > 0 ? (
              <div className="space-y-3">
                {offlineMaps.slice(0, 2).map(map => (
                  <div key={map.id} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded bg-gray-700 mr-3 flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-white/60" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{map.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {map.sizeInMB} MB • Downloaded {formatDate(new Date(map.downloadedAt))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {offlineMaps.length > 2 && (
                  <Button variant="outline" size="sm" className="w-full">
                    View All ({offlineMaps.length})
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Download className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>No offline maps downloaded</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Logout Button */}
        <Button 
          variant="outline" 
          className="w-full text-destructive border-destructive hover:bg-destructive/10"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          {isLoggingOut ? 'Logging out...' : 'Log out'}
        </Button>
      </div>

      {/* iOS Home Indicator */}
      <div className="ios-home-indicator fixed bottom-0 left-0 right-0 flex justify-center items-center h-8 bg-background">
        <div className="w-32 h-1 bg-white/30 rounded-full"></div>
      </div>
    </div>
  );
};

export default Profile;
