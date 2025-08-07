// Version checking and cache busting utilities for mobile apps
export class VersionChecker {
  private static readonly CURRENT_VERSION = '2.0.3-extreme-refresh';
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
    const randomId = Math.random().toString(36).substring(7);
    const cacheBustUrl = `${window.location.origin}${window.location.pathname}?v=${this.CURRENT_VERSION}&t=${timestamp}&r=${randomId}&mobile=true&force=1`;
    
    console.log('🚀 FORCE REFRESH - Mobile cache busting:', cacheBustUrl);
    
    // Aggressive cache clearing
    try {
      // Clear all localStorage
      localStorage.clear();
      
      // Clear all sessionStorage  
      sessionStorage.clear();
      
      // Clear service worker cache
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(registration => {
            console.log('Unregistering service worker');
            registration.unregister();
          });
        });
      }
      
      // Clear browser cache
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            console.log('Deleting cache:', name);
            caches.delete(name);
          });
        });
      }
      
      // Clear browser history state
      if (window.history.replaceState) {
        window.history.replaceState(null, '', cacheBustUrl);
      }
      
    } catch (error) {
      console.error('Cache clearing error:', error);
    }
    
    // Multiple refresh attempts for stubborn mobile browsers
    console.log('🔄 Attempting multiple refresh methods...');
    
    // Method 1: location.replace (immediate)
    window.location.replace(cacheBustUrl);
    
    // Method 2: location.href (backup after 100ms)
    setTimeout(() => {
      if (window.location.href.indexOf('mobile=true') === -1) {
        window.location.href = cacheBustUrl;
      }
    }, 100);
    
    // Method 3: window.open then close (backup after 200ms)
    setTimeout(() => {
      if (window.location.href.indexOf('mobile=true') === -1) {
        const newWindow = window.open(cacheBustUrl, '_self');
        if (newWindow) {
          newWindow.focus();
        }
      }
    }, 200);
  }
  
  /**
   * Get current app version
   */
  static getCurrentVersion(): string {
    return this.CURRENT_VERSION;
  }
}