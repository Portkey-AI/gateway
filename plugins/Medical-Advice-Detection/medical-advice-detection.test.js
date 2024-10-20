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
const medical_advice_detection_1 = require("./medical-advice-detection");
describe('Medical Advice Detection Plugin', () => {
    it('flags response with medical advice', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = {
            response: "The treatment for this condition is to prescribe medication.",
            request: {}
        };
        const parameters = {
            warningThreshold: 0.7
        };
        const options = { env: {} }; // Passing an empty options object
        const result = yield (0, medical_advice_detection_1.handler)(context, parameters, 'afterRequestHook', options);
        expect(result.verdict).toBe(false);
        expect(result.data).toHaveProperty('warning');
    }));
    it('allows response without medical advice', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = {
            response: "You should drink more water to stay hydrated.",
            request: {}
        };
        const parameters = {
            warningThreshold: 0.7
        };
        const options = { env: {} }; // Passing an empty options object
        const result = yield (0, medical_advice_detection_1.handler)(context, parameters, 'afterRequestHook', options);
        expect(result.verdict).toBe(true);
        expect(result.data).not.toHaveProperty('warning');
    }));
});
