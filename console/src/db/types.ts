export interface PushPreset {
  id: number;
  name: string;
  protocol: string;
  url_template: string;
  stream_key: string | null;
  created_at: string;
}

export interface KeyPreset {
  id: number;
  name: string;
  protocol: string;
  expires_in_hours: number | null;
  created_at: string;
}
