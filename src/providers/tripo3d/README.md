# Tripo3D Provider - Credit Tracking

The Tripo3D provider now includes credit tracking functionality to help users understand and monitor their API usage costs.

## Credit Tracking Features

### `getTask` Response - Credits Used
When checking a completed task status, the response now includes a `credits_used` field:

```json
{
  "code": 0,
  "data": {
    "task_id": "abc123",
    "type": "text_to_3d",
    "status": "success",
    "progress": 100,
    "input": {
      "type": "text_to_3d",
      "prompt": "A cute robot",
      "texture_quality": "high",
      "pbr": true
    },
    "output": {
      "model": "https://...",
      "pbr_model": "https://..."
    },
    "credits_used": 17,
    "create_time": 1692825600
  },
  "provider": "tripo3d"
}
```

## Credit Calculation

Credits are calculated based on:

1. **Base Task Cost** - Varies by task type:
   - `text_to_3d`, `image_to_3d`, `multiview_to_3d`: 10 credits
   - `animate`: 15 credits
   - `refine_model`, `retexture`, `stylize`: 5 credits
   - `convert`: 2 credits
   - Others: 5 credits (default)

2. **Quality Modifiers**:
   - `texture_quality: "standard"`: +0 credits
   - `texture_quality: "high"`: +5 credits
   - `texture_quality: "ultra"`: +10 credits

3. **Feature Modifiers**:
   - `pbr: true`: +2 credits
   - `quad: true`: +3 credits
   - `with_animation: true`: +5 credits
   - `bake_animation: true`: +2 credits
   - `pack_uv: true`: +1 credit
   - `bake: true`: +2 credits

## Example Calculations

### Basic Text-to-3D
```javascript
// Request
{
  "type": "text_to_3d",
  "prompt": "A simple cube"
}
// Credits: 10 (base)
```

### High-Quality Text-to-3D with PBR
```javascript
// Request
{
  "type": "text_to_3d", 
  "prompt": "A detailed robot",
  "texture_quality": "high",
  "pbr": true
}
// Credits: 10 (base) + 5 (high quality) + 2 (PBR) = 17
```

### Animation Task with Multiple Features
```javascript
// Request
{
  "type": "animate",
  "with_animation": true,
  "bake_animation": true
}
// Credits: 15 (base) + 5 (animation) + 2 (bake) = 22
```

## Important Notes

1. **Estimates Only**: These are estimated credits based on embedded pricing logic. Actual credits may vary if Tripo3D changes their pricing.

2. **Completed Tasks Only**: `credits_used` field only appears for tasks with `status: "success"`.

3. **Async Limitation**: Credits are consumed when tasks complete, not when created. This is due to Tripo3D's async task architecture.

4. **Pricing Updates**: The pricing table in `src/providers/tripo3d/pricing.ts` should be updated when Tripo3D changes their pricing structure.

## Testing

Run the pricing calculation tests:
```bash
npx jest src/providers/tripo3d/pricing.test.ts
```