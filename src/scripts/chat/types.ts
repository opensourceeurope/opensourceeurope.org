export interface Citation {
  n?: number;
  url: string;
  title?: string;
  source_name?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatReply {
  answer: string;
  citations: Citation[];
  /** Suggested next questions, at most 3. Empty when there are none. */
  followups: string[];
}

export interface ChatTexts {
  title: string;
  intro: string;
  placeholder: string;
  input_label: string;
  send_label: string;
  suggestions_label: string;
  suggestions: string[];
  sharing_on: string;
  sharing_off: string;
  sharing_settings: string;
  small_model_note_short: string;
  memory_note: string;
  sources_label: string;
  you_label: string;
  assistant_label: string;
  loading: string;
  loading_long: string;
  status_searching_start: string;
  status_searching: string;
  status_writing: string;
  status_ready: string;
  stop_label: string;
  stopped_note: string;
  followups_label: string;
  error: string;
  error_busy: string;
  error_unavailable: string;
  error_timeout: string;
  no_js: string;
  open_label: string;
  close_label: string;
  how_it_works: { label: string; href: string };
  shortcut_mac: string;
  shortcut_other: string;
}
