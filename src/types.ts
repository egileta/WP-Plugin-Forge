export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  geminiKey?: string;
  geminiModel?: string;
}

export interface PluginFile {
  path: string;
  content: string;
}

export interface PushResult {
  sha: string;
  url: string;
  created: boolean;
}

export interface GenerationResult {
  pluginName: string;
  description: string;
  files: PluginFile[];
}
