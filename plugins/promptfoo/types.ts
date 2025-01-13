// Common types
export interface PromptfooResult<T> {
  model: string;
  results: T[];
}

// Guard types
export interface GuardCategories {
  prompt_injection: boolean;
  jailbreak: boolean;
}

export interface GuardCategoryScores {
  prompt_injection: number;
  jailbreak: number;
}

export interface GuardResult {
  categories: GuardCategories;
  category_scores: GuardCategoryScores;
  flagged: boolean;
}

// PII types
export interface PIIEntity {
  entity_type: string;
  start: number;
  end: number;
  pii: string;
}

export interface PIICategories {
  pii: boolean;
}

export interface PIICategoryScores {
  pii: number;
}

export interface PIIPayload {
  pii: PIIEntity[];
}

export interface PIIResult {
  categories: PIICategories;
  category_scores: PIICategoryScores;
  flagged: boolean;
  payload: PIIPayload;
}

// Harm types
export interface HarmCategories {
  violent_crimes?: boolean;
  non_violent_crimes?: boolean;
  sex_related_crimes?: boolean;
  child_sexual_exploitation?: boolean;
  defamation?: boolean;
  specialized_advice?: boolean;
  privacy?: boolean;
  intellectual_property?: boolean;
  indiscriminate_weapons?: boolean;
  hate?: boolean;
  suicide_and_self_harm?: boolean;
  sexual_content?: boolean;
  elections?: boolean;
  code_interpreter_abuse?: boolean;
}

export interface HarmCategoryScores {
  violent_crimes?: number;
  non_violent_crimes?: number;
  sex_related_crimes?: number;
  child_sexual_exploitation?: number;
  defamation?: number;
  specialized_advice?: number;
  privacy?: number;
  intellectual_property?: number;
  indiscriminate_weapons?: number;
  hate?: number;
  suicide_and_self_harm?: number;
  sexual_content?: number;
  elections?: number;
  code_interpreter_abuse?: number;
}

export interface HarmResult {
  categories: HarmCategories;
  category_scores: HarmCategoryScores;
  flagged: boolean;
}
