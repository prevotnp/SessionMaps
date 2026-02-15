import React from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import Profile from "@/pages/Profile";
import AdminPanel from "@/pages/AdminPanel";
import DroneModelViewer from "@/pages/DroneModelViewer";
import LiveSharedMap from "@/pages/LiveSharedMap";
import Explore from "@/pages/Explore";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import RecordActivity from "@/pages/RecordActivity";
import ActivityDetail from "@/pages/ActivityDetail";
import CesiumViewer from "@/pages/CesiumViewer";

function ProtectedRoute({ component: Component, ...props }: { component: React.ComponentType<any>, [key: string]: any }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen bg-slate-900"><div className="text-white">Loading...</div></div>;
  }
  
  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }
  
  return <Component {...props} />;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/login" component={Auth} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/record-activity">{() => <ProtectedRoute component={RecordActivity} />}</Route>
      <Route path="/activities/:id">{(params) => <ProtectedRoute component={ActivityDetail} {...params} />}</Route>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Auth} />
      ) : (
        <>
          <Route path="/" component={Home} />
          <Route path="/explore" component={Explore} />
          <Route path="/profile" component={Profile} />
          <Route path="/admin" component={AdminPanel} />
          <Route path="/drone/:id/3d" component={DroneModelViewer} />
          <Route path="/cesium/:id" component={CesiumViewer} />
          <Route path="/live-map/:id" component={LiveSharedMap} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;