"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const handler = (context, parameters, eventType) => __awaiter(void 0, void 0, void 0, function* () {
    if (eventType !== 'afterRequestHook') {
        return { error: null, verdict: true, data: {} };
    }
    const { response } = context;
    const { warningThreshold } = parameters;
    // Assuming we have a function `detectMedicalAdvice` that returns a confidence score (0 to 1)
    const confidenceScore = yield detectMedicalAdvice(response);
    if (confidenceScore >= warningThreshold) {
        return {
            error: null,
            verdict: false,
            data: {
                warning: "Medical advice detected in the response. Please consult a professional."
            }
        };
    }
    return {
        error: null,
        verdict: true,
        data: {}
    };
});
exports.handler = handler;
// Example of a mock medical advice detection function
function detectMedicalAdvice(text) {
    return __awaiter(this, void 0, void 0, function* () {
        // Placeholder logic to simulate detecting medical advice (0 means no confidence, 1 means high confidence)
        const medicalKeywords = ['prescribe', 'diagnosis', 'treatment', 'medication', 'symptoms'];
        const found = medicalKeywords.some(keyword => text.includes(keyword));
        return found ? 0.8 : 0.2; // Simulating a confidence score
    });
}
