import { Extraction, Textualdetection, TextualdetectionType } from './model';

export interface GuardResult {
  matched: boolean;
  guardName: GuardName;
  threshold: string;
  actualValue: number;
  matchCount: number;
  matchValues: string[];
}

export class GuardName {
  private constructor(private readonly name: string) {}

  // Static instances
  public static readonly PROMPT_INJECTION = new GuardName('PROMPT_INJECTION');
  public static readonly JAIL_BREAK = new GuardName('JAILBREAK');
  public static readonly MALICIOUS_URL = new GuardName('MALICIOUS_URL');
  public static readonly TOXIC = new GuardName('TOXIC');
  public static readonly BIASED = new GuardName('BIASED');
  public static readonly HARMFUL_CONTENT = new GuardName('HARMFUL');
  public static readonly LANGUAGE = new GuardName('LANGUAGE');
  public static readonly PII_DETECTOR = new GuardName('PII_DETECTOR');
  public static readonly SECRETS_DETECTOR = new GuardName('SECRETS_DETECTOR');
  public static readonly KEYWORD_DETECTOR = new GuardName('KEYWORD_DETECTOR');

  public toString(): string {
    return this.name;
  }

  public equals(other: GuardName): boolean {
    return this.name === other.name;
  }
}

/**
 * Decodes a JWT token without validation
 * @param {string} token - The JWT token to decode
 * @returns {Object|null} The decoded payload or null if invalid
 */
function decodeJwt(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Convert Base64Url to Base64
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');

    // Decode Base64 payload
    const jsonPayload = new TextDecoder().decode(
      Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
}

export function getApexUrlFromToken(token: string): string | null {
  try {
    const decodedToken = decodeJwt(token);
    const opaqueObj = decodedToken['opaque'] as { 'apex-url': string };
    const apex_url = opaqueObj['apex-url'];
    return apex_url;
  } catch (error) {
    return null;
  }
}

export class ResponseHelper {
  /**
   * Evaluates a check condition using guard name and threshold.
   *
   * @param extraction - Provides all the extractions based on the detection engine
   * @param guardName - The name of the guard to evaluate
   * @param threshold - The threshold value to compare against
   * @param matchName - The match name for the guard
   * @returns GuardResult with TRUE if condition met, False if not met
   */
  public evaluate(
    extraction: Extraction,
    guardName: GuardName,
    threshold: number,
    matchName?: string
  ): GuardResult {
    let exists = false;
    let value = 0.0;
    let matchCount = 0;
    let matchValues: string[] = [];

    try {
      if (
        guardName.equals(GuardName.PROMPT_INJECTION) ||
        guardName.equals(GuardName.JAIL_BREAK) ||
        guardName.equals(GuardName.MALICIOUS_URL)
      ) {
        [exists, value] = this.getGuardValue(
          extraction.exploits,
          guardName.toString().toLowerCase()
        );
      } else if (
        guardName.equals(GuardName.TOXIC) ||
        guardName.equals(GuardName.BIASED) ||
        guardName.equals(GuardName.HARMFUL_CONTENT)
      ) {
        [exists, value] = this.getGuardValue(
          extraction.malcontents,
          guardName.toString().toLowerCase()
        );
      } else if (guardName.equals(GuardName.LANGUAGE)) {
        if (matchName) {
          [exists, value] = this.getGuardValue(extraction.languages, matchName);
        } else if (extraction.languages) {
          exists = Object.keys(extraction.languages).length > 0;
          value = 1.0;
        }
      } else if (guardName.equals(GuardName.PII_DETECTOR)) {
        [exists, value, matchCount, matchValues] = this.getTextDetections(
          extraction.piIs,
          threshold,
          TextualdetectionType.Pii,
          extraction.detections,
          matchName
        );
      } else if (guardName.equals(GuardName.SECRETS_DETECTOR)) {
        [exists, value, matchCount, matchValues] = this.getTextDetections(
          extraction.secrets,
          threshold,
          TextualdetectionType.Secret,
          extraction.detections,
          matchName
        );
      } else if (guardName.equals(GuardName.KEYWORD_DETECTOR)) {
        [exists, value, matchCount, matchValues] = this.getTextDetections(
          extraction.keywords,
          threshold,
          TextualdetectionType.Keyword,
          extraction.detections,
          matchName
        );
      }

      const matched = exists && value >= threshold;

      return {
        matched,
        guardName,
        threshold: threshold.toString(),
        actualValue: value,
        matchCount,
        matchValues,
      };
    } catch (e) {
      throw new Error(
        `Error in evaluation: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  /**
   * Gets the guard value from a lookup object
   */
  private getGuardValue(
    lookup: Record<string, number> | undefined,
    key: string
  ): [boolean, number] {
    if (!lookup || !(key in lookup)) {
      return [false, 0.0];
    }
    return [true, lookup[key]];
  }

  /**
   * Gets text detection values
   */
  private getTextDetections(
    lookup: Record<string, number> | undefined,
    threshold: number,
    detectionType: TextualdetectionType,
    detections: Textualdetection[] | undefined,
    matchName?: string
  ): [boolean, number, number, string[]] {
    if (matchName) {
      if (!detections) {
        return [false, 0.0, 0, []];
      }

      const textMatches = detections
        .filter(
          (d): d is Textualdetection & { score: number } =>
            d.type === detectionType &&
            d.name === matchName &&
            d.score !== null &&
            typeof d.score === 'number' &&
            d.score >= threshold
        )
        .map((d) => d.score);

      const count = textMatches.length;

      if (count === 0 && lookup && matchName in lookup) {
        const lookupValue = lookup[matchName];
        if (typeof lookupValue === 'number') {
          return [true, lookupValue, 1, [matchName]];
        }
      }

      if (count === 0) {
        return [false, 0.0, 0, []];
      }

      const maxScore = Math.max(...textMatches);
      return [true, maxScore, count, [matchName]];
    }

    const exists = !!lookup && Object.keys(lookup).length > 0;
    return [
      exists,
      exists ? 1.0 : 0.0,
      lookup ? Object.keys(lookup).length : 0,
      lookup ? Object.keys(lookup) : [],
    ];
  }
}
