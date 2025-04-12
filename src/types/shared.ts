/**
 * A filter used to compare a specified attribute key to a given value using a
 * defined comparison operation.
 */
export interface ComparisonFilter {
  /**
   * The key to compare against the value.
   */
  key: string;

  /**
   * Specifies the comparison operator: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`.
   *
   * - `eq`: equals
   * - `ne`: not equal
   * - `gt`: greater than
   * - `gte`: greater than or equal
   * - `lt`: less than
   * - `lte`: less than or equal
   */
  type: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

  /**
   * The value to compare against the attribute key; supports string, number, or
   * boolean types.
   */
  value: string | number | boolean;
}

/**
 * Combine multiple filters using `and` or `or`.
 */
export interface CompoundFilter {
  /**
   * Array of filters to combine. Items can be `ComparisonFilter` or
   * `CompoundFilter`.
   */
  filters: Array<ComparisonFilter | unknown>;

  /**
   * Type of operation: `and` or `or`.
   */
  type: 'and' | 'or';
}

/**
 * Set of 16 key-value pairs that can be attached to an object. This can be useful
 * for storing additional information about the object in a structured format, and
 * querying for objects via API or the dashboard.
 *
 * Keys are strings with a maximum length of 64 characters. Values are strings with
 * a maximum length of 512 characters.
 */
export type Metadata = Record<string, string>;

/**
 * **o-series models only**
 *
 * Configuration options for
 * [reasoning models](https://platform.openai.com/docs/guides/reasoning).
 */
export interface Reasoning {
  /**
   * **o-series models only**
   *
   * Constrains effort on reasoning for
   * [reasoning models](https://platform.openai.com/docs/guides/reasoning). Currently
   * supported values are `low`, `medium`, and `high`. Reducing reasoning effort can
   * result in faster responses and fewer tokens used on reasoning in a response.
   */
  effort: ReasoningEffort | null;

  /**
   * **o-series models only**
   *
   * A summary of the reasoning performed by the model. This can be useful for
   * debugging and understanding the model's reasoning process. One of `concise` or
   * `detailed`.
   */
  generate_summary?: 'concise' | 'detailed' | null;
}

/**
 * **o-series models only**
 *
 * Constrains effort on reasoning for
 * [reasoning models](https://platform.openai.com/docs/guides/reasoning). Currently
 * supported values are `low`, `medium`, and `high`. Reducing reasoning effort can
 * result in faster responses and fewer tokens used on reasoning in a response.
 */
export type ReasoningEffort = 'low' | 'medium' | 'high' | null;

/**
 * Default response format. Used to generate text responses.
 */
export interface ResponseFormatText {
  /**
   * The type of response format being defined. Always `text`.
   */
  type: 'text';
}

/**
 * JSON object response format. An older method of generating JSON responses. Using
 * `json_schema` is recommended for models that support it. Note that the model
 * will not generate JSON without a system or user message instructing it to do so.
 */
export interface ResponseFormatJSONObject {
  /**
   * The type of response format being defined. Always `json_object`.
   */
  type: 'json_object';
}

export interface CursorPageParams {
  after?: string;

  limit?: number;
}
