export type ClosedEnum<T> = T[keyof T];

export type Modality = {
  /**
   * The group of data.
   */
  group: string;
  /**
   * The type of data.
   */
  type: string;
};

/**
 * The type of detection.
 */
export const TextualdetectionType = {
  Keyword: 'Keyword',
  Pii: 'PII',
  Secret: 'Secret',
} as const;

/**
 * The type of detection.
 */
export type TextualdetectionType = ClosedEnum<typeof TextualdetectionType>;

/**
 * Represents a textual detection done by policy.
 */
export type Textualdetection = {
  /**
   * The end position of the detection in the original data.
   */
  end?: number | undefined;
  /**
   * The key that is used in the name's place, If empty, a sequence of X's are used.
   */
  key?: string | undefined;
  /**
   * The name of the detection.
   */
  name?: string | undefined;
  /**
   * If true this detection has been redacted.
   */
  redacted?: boolean | undefined;
  /**
   * The end position of the detection in the redacted data.
   */
  redactedEnd?: number | undefined;
  /**
   * The start position of the detection in the redacted data.
   */
  redactedStart?: number | undefined;
  /**
   * The confidence score of the detection.
   */
  score?: number | undefined;
  /**
   * The start position of the detection in the original data.
   */
  start?: number | undefined;
  /**
   * The type of detection.
   */
  type?: TextualdetectionType | undefined;
};

export type Extraction = {
  /**
   * The PIIs found during classification.
   */
  piIs?: { [k: string]: number } | undefined;
  /**
   * Annotations attached to the extraction.
   */
  annotations?: { [k: string]: string } | undefined;
  /**
   * The level of general confidentiality of the input.
   */
  confidentiality?: number | undefined;
  /**
   * The data extracted.
   */
  data?: string | undefined;
  /**
   * The detections found while applying policies.
   */
  detections?: Array<Textualdetection> | undefined;
  /**
   * The various exploits attempts.
   */
  exploits?: { [k: string]: number } | undefined;
  /**
   * The hash of the extraction.
   */
  hash?: string | undefined;
  /**
   * The estimated intent embodied into the text.
   */
  intent?: { [k: string]: number } | undefined;
  /**
   * If true, this extraction is for internal use only. This can be used by agentic
   *
   * @remarks
   * systems to mark an extraction as internal only as opposed to user facing.
   */
  internal?: boolean | undefined;
  /**
   * The keywords found during classification.
   */
  keywords?: { [k: string]: number } | undefined;
  /**
   * A means of distinguishing what was extracted, such as prompt, input file or
   *
   * @remarks
   * code.
   */
  label?: string | undefined;
  /**
   * The language of the classification.
   */
  languages?: { [k: string]: number } | undefined;
  /**
   * The various malcontents attempts.
   *
   * @remarks
   *
   * The current list can be obtained through the analyzers API by searching for
   * detector groups 'Malcontents' accross all analyzers.
   *
   * Example of malcontents: biased, harmful, toxic.
   */
  malcontents?: { [k: string]: number } | undefined;
  /**
   * The modalities of data detected in the data.
   */
  modalities?: Array<Modality> | undefined;
  /**
   * The level of general organization relevance of the input.
   */
  relevance?: number | undefined;
  /**
   * The secrets found during classification.
   */
  secrets?: { [k: string]: number } | undefined;
  /**
   * The topic of the classification.
   */
  topics?: { [k: string]: number } | undefined;
};
