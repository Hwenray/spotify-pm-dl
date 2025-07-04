export interface SpotifyTokenResponse {
  access_token: string;
}

export interface SpotifyTrackItem {
  track: {
    external_urls: {
      spotify: string;
    };
  };
}

export interface SpotifyPlaylistResponse {
  items: SpotifyTrackItem[];
  next: string | null;
}

export interface DownloaderizeResponse {
  success: boolean;
  data: {
    downloadLink: string;
    artist: string;
    title: string;
  };
}

export interface FailedTrack {
  url: string;
  error: string;
  timestamp: string;
}