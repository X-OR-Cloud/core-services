export interface SkillFile {
  /** Relative path within the skill directory (e.g. "SKILL.md", "references/invoice.md") */
  path: string;
  /** Full file content (markdown or plain text) */
  content: string;
  /** SHA-256 checksum of content — used by Agent Runner for incremental updates */
  checksum: string;
  /** Whether the file should be marked executable (e.g. shell scripts) */
  executable: boolean;
}

export interface SkillAuth {
  type: 'bearer';
  header: 'Authorization';
  note: string;
}

export interface SkillManifest {
  /** Skill identifier — matches service name */
  name: string;
  /** SHA-256 hash of all file checksums combined — Agent Runner uses this to detect changes */
  version: string;
  description: string;
  generated_at: string;
  /** CBM service base URL (from CBM_BASE_URL env) */
  base_url: string;
  auth: SkillAuth;
  /** All files the Agent Runner should write into {base_skill_dir}/cbm/ */
  files: SkillFile[];
}
