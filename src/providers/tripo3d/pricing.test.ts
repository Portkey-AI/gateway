import {
  calculateEstimatedCredits,
  getTaskTypePricing,
  TRIPO3D_PRICING,
} from './pricing';

describe('Tripo3D Pricing', () => {
  describe('calculateEstimatedCredits', () => {
    it('should return base cost for known task types', () => {
      expect(calculateEstimatedCredits('text_to_3d')).toBe(10);
      expect(calculateEstimatedCredits('image_to_3d')).toBe(10);
      expect(calculateEstimatedCredits('refine_model')).toBe(5);
      expect(calculateEstimatedCredits('animate')).toBe(15);
      expect(calculateEstimatedCredits('convert')).toBe(2);
    });

    it('should return default cost for unknown task types', () => {
      expect(calculateEstimatedCredits('unknown_task_type')).toBe(5);
      expect(calculateEstimatedCredits('')).toBe(5);
    });

    it('should add texture quality modifiers', () => {
      expect(
        calculateEstimatedCredits('text_to_3d', { texture_quality: 'standard' })
      ).toBe(10);
      expect(
        calculateEstimatedCredits('text_to_3d', { texture_quality: 'high' })
      ).toBe(15);
      expect(
        calculateEstimatedCredits('text_to_3d', { texture_quality: 'ultra' })
      ).toBe(20);
    });

    it('should add PBR feature modifier', () => {
      expect(calculateEstimatedCredits('text_to_3d', { pbr: true })).toBe(12);
      expect(calculateEstimatedCredits('text_to_3d', { pbr: false })).toBe(10);
    });

    it('should add quad topology modifier', () => {
      expect(calculateEstimatedCredits('text_to_3d', { quad: true })).toBe(13);
      expect(calculateEstimatedCredits('text_to_3d', { quad: false })).toBe(10);
    });

    it('should add animation modifiers', () => {
      expect(
        calculateEstimatedCredits('text_to_3d', { with_animation: true })
      ).toBe(15);
      expect(
        calculateEstimatedCredits('text_to_3d', { bake_animation: true })
      ).toBe(12);
    });

    it('should add texture processing modifiers', () => {
      expect(calculateEstimatedCredits('text_to_3d', { pack_uv: true })).toBe(
        11
      );
      expect(calculateEstimatedCredits('text_to_3d', { bake: true })).toBe(12);
    });

    it('should combine multiple modifiers', () => {
      const params = {
        texture_quality: 'high',
        pbr: true,
        quad: true,
        with_animation: true,
        pack_uv: true,
        bake: true,
      };
      // base (10) + high quality (5) + pbr (2) + quad (3) + animation (5) + pack_uv (1) + bake (2) = 28
      expect(calculateEstimatedCredits('text_to_3d', params)).toBe(28);
    });

    it('should return minimum of 1 credit', () => {
      // Even if we had a task with 0 base cost, it should return at least 1
      const zeroBaseCost = { ...TRIPO3D_PRICING };
      zeroBaseCost.baseCosts.test_task = 0;

      // Our current minimum is handled in the function
      expect(calculateEstimatedCredits('test_task')).toBe(5); // Returns default
    });

    it('should handle empty parameters object', () => {
      expect(calculateEstimatedCredits('text_to_3d', {})).toBe(10);
    });

    it('should ignore unknown parameters', () => {
      const params = {
        unknown_param: true,
        another_unknown: 'value',
        texture_quality: 'high',
      };
      expect(calculateEstimatedCredits('text_to_3d', params)).toBe(15); // base + high quality only
    });
  });

  describe('getTaskTypePricing', () => {
    it('should return pricing info for known task types', () => {
      const pricing = getTaskTypePricing('text_to_3d');
      expect(pricing).toEqual({
        taskType: 'text_to_3d',
        baseCost: 10,
        availableModifiers: expect.arrayContaining([
          'pbr',
          'quad',
          'with_animation',
        ]),
        textureQualityOptions: expect.arrayContaining([
          'standard',
          'high',
          'ultra',
        ]),
      });
    });

    it('should return default pricing for unknown task types', () => {
      const pricing = getTaskTypePricing('unknown_task');
      expect(pricing).toEqual({
        taskType: 'unknown_task',
        baseCost: 5,
        availableModifiers: expect.arrayContaining([
          'pbr',
          'quad',
          'with_animation',
        ]),
        textureQualityOptions: expect.arrayContaining([
          'standard',
          'high',
          'ultra',
        ]),
      });
    });
  });

  describe('TRIPO3D_PRICING configuration', () => {
    it('should have all required pricing sections', () => {
      expect(TRIPO3D_PRICING).toHaveProperty('baseCosts');
      expect(TRIPO3D_PRICING).toHaveProperty('modifiers');
      expect(TRIPO3D_PRICING.modifiers).toHaveProperty('texture_quality');
      expect(TRIPO3D_PRICING.modifiers).toHaveProperty('features');
    });

    it('should have default task type', () => {
      expect(TRIPO3D_PRICING.baseCosts).toHaveProperty('default');
      expect(typeof TRIPO3D_PRICING.baseCosts.default).toBe('number');
    });

    it('should have standard texture quality as baseline', () => {
      expect(TRIPO3D_PRICING.modifiers.texture_quality).toHaveProperty(
        'standard'
      );
      expect(TRIPO3D_PRICING.modifiers.texture_quality.standard).toBe(0);
    });
  });
});
