import { ResponseHelper, GuardName, GuardResult } from './helper';
import { Extraction } from './model';

describe('ResponseHelper - evaluate method', () => {
  let responseHelper: ResponseHelper;

  beforeEach(() => {
    responseHelper = new ResponseHelper();
  });

  describe('PROMPT_INJECTION guard', () => {
    it('should return matched true when exploit exists and value is above threshold', () => {
      // Arrange
      const extraction: Extraction = {
        exploits: {
          prompt_injection: 0.8,
        },
      };
      const threshold = 0.7;

      // Act
      const result = responseHelper.evaluate(
        extraction,
        GuardName.PROMPT_INJECTION,
        threshold
      );

      // Assert
      expect(result.matched).toBe(true);
      expect(result.guardName).toBe(GuardName.PROMPT_INJECTION);
      expect(result.threshold).toBe('0.7');
      expect(result.actualValue).toBe(0.8);
      expect(result.matchCount).toBe(0);
      expect(result.matchValues).toEqual([]);
    });

    it('should return matched false when exploit exists but value is below threshold', () => {
      // Arrange
      const extraction: Extraction = {
        exploits: {
          prompt_injection: 0.5,
        },
      };
      const threshold = 0.7;

      // Act
      const result = responseHelper.evaluate(
        extraction,
        GuardName.PROMPT_INJECTION,
        threshold
      );

      // Assert
      expect(result.matched).toBe(false);
      expect(result.guardName).toBe(GuardName.PROMPT_INJECTION);
      expect(result.threshold).toBe('0.7');
      expect(result.actualValue).toBe(0.5);
      expect(result.matchCount).toBe(0);
      expect(result.matchValues).toEqual([]);
    });

    it('should return matched false when exploit does not exist', () => {
      // Arrange
      const extraction: Extraction = {
        exploits: {},
      };
      const threshold = 0.7;

      // Act
      const result = responseHelper.evaluate(
        extraction,
        GuardName.PROMPT_INJECTION,
        threshold
      );

      // Assert
      expect(result.matched).toBe(false);
      expect(result.guardName).toBe(GuardName.PROMPT_INJECTION);
      expect(result.threshold).toBe('0.7');
      expect(result.actualValue).toBe(0.0);
      expect(result.matchCount).toBe(0);
      expect(result.matchValues).toEqual([]);
    });

    it('should return matched false when exploits object is undefined', () => {
      // Arrange
      const extraction: Extraction = {};
      const threshold = 0.7;

      // Act
      const result = responseHelper.evaluate(
        extraction,
        GuardName.PROMPT_INJECTION,
        threshold
      );

      // Assert
      expect(result.matched).toBe(false);
      expect(result.guardName).toBe(GuardName.PROMPT_INJECTION);
      expect(result.threshold).toBe('0.7');
      expect(result.actualValue).toBe(0.0);
      expect(result.matchCount).toBe(0);
      expect(result.matchValues).toEqual([]);
    });

    it('should throw error when extraction is null', () => {
      // Arrange
      const threshold = 0.7;

      // Act & Assert
      expect(() => {
        responseHelper.evaluate(
          null as unknown as Extraction,
          GuardName.PROMPT_INJECTION,
          threshold
        );
      }).toThrow();
    });
  });
});
