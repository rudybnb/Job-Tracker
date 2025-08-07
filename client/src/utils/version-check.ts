// Version checking and cache busting utilities for mobile apps
export class VersionChecker {
  private static readonly CURRENT_VERSION = '2.0.0-telegram-fixed';
  private static readonly VERSION_KEY = 'app_version';
  
  /**
   * Check if app needs to be refreshed due to version mismatch
   */
  static checkVersionAndRefresh(): boolean {
    try {
      const storedVersion = localStorage.getItem(this.VERSION_KEY);
      
      if (storedVersion !== this.CURRENT_VERSION) {
        console.log('🔄 Version mismatch detected:', {
          stored: storedVersion,
          current: this.CURRENT_VERSION
        });
        
        // Clear all storage to prevent conflicts
        localStorage.clear();
        sessionStorage.clear();
        
        // Update to current version
        localStorage.setItem(this.VERSION_KEY, this.CURRENT_VERSION);
        
        // Force reload with cache busting
        this.forceRefreshWithCacheBust();
        return true;
      }
      
      // Ensure version is stored
      if (!storedVersion) {
        localStorage.setItem(this.VERSION_KEY, this.CURRENT_VERSION);
      }
      
      return false;
    } catch (error) {
      console.error('Version check failed:', error);
      return false;
    }
  }
  
  /**
   * Force refresh with aggressive cache busting
   */
  static forceRefreshWithCacheBust(): void {
    const timestamp = Date.now();
    const cacheBustUrl = `${window.location.origin}${window.location.pathname}?v=${this.CURRENT_VERSION}&cache_bust=${timestamp}&mobile_refresh=true`;
    
    console.log('🚀 Force refreshing with cache bust:', cacheBustUrl);
    
    // Clear service worker cache if present
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          registration.unregister();
        });
      });
    }
    
    // Clear browser cache
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }
    
    // Force navigation with cache busting
    setTimeout(() => {
      window.location.replace(cacheBustUrl);
    }, 100);
  }
  
  /**
   * Get current app version
   */
  static getCurrentVersion(): string {
    return this.CURRENT_VERSION;
  }
}