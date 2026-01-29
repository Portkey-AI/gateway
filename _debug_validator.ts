import { VALID_PROVIDERS } from './src/globals';
import { requestValidator } from './src/middlewares/requestValidator';

console.log('Testing custom-host provider validation...');
console.log('VALID_PROVIDERS includes custom-host:', VALID_PROVIDERS.includes('custom-host'));

const mockContext = {
    req: {
        raw: {
            headers: new Map([
                ['x-portkey-provider', 'custom-host'],
                ['content-type', 'application/json']
            ])
        }
    }
};

const next = () => {
    console.log('Validation passed!');
    return 'OK';
};

const result = requestValidator(mockContext as any, next);
if (result instanceof Response) {
    result.json().then(data => {
        console.log('Validation failed with response:', data);
    });
} else {
    console.log('Result:', result);
}
