import crypto from 'crypto';
import { post } from '../utils';

interface APIResponse {
  minSupportedAPIVersion: number;
  maxSupportedAPIVersion: number;
  error?: string;
}

interface RegisterResponse extends APIResponse {
  documents: RegisterResponseDocument[];
}
interface RegisterResponseDocument {
  retrievalId: string;
}

interface GetSealResponse extends APIResponse {
  documents: GetSealResponseDocument[];
}
interface GetSealResponseDocument {
  retrievalId: string;
  seal: Seal;
  submittedAt: number;
  hasBeenInsertedIntoAtLeastOneBlockchain: boolean;
  blockchainRegistrations: BlockchainRegistration[];
  hasBeenInsertedIntoAllRequestedBlockchains: boolean;
}
interface Seal {}
interface BlockchainRegistration {}

export class APIAccess {
  apiKey: string;
  apiCredential: string;

  constructor(apiKey: string, apiCredential: string) {
    this.apiKey = apiKey;
    this.apiCredential = apiCredential;
  }

  private async apiRequest(
    callName: string,
    reqParams: object
  ): Promise<APIResponse> {
    //const server="http://localhost:8080"; // for local debugging
    const server = 'https://developers.cryptowerk.com';
    return new Promise((resolve, reject) => {
      const apiUrl = server + '/platform/API/v8/' + callName;
      post(
        apiUrl,
        reqParams, // JSON.stringify() is done by post()
        {
          headers: {
            'X-ApiKey': this.apiKey + ' ' + this.apiCredential,
            // already set by post(): 'Content-Type': 'application/json', //"application/x-www-form-urlencoded"
            // no suitable for post(): 'Content-Length': String(Buffer.byteLength(postData)),
          },
        },
        30000 // timeout
      )
        .then((json: APIResponse) => {
          if (json.error) reject('Server responded with error: ' + json.error);
          else resolve(json);
        })
        .catch((e) => {
          let msg = e.toString();
          if (e.response) {
            const response = e.response;
            if (response.status) msg += ', status=' + response.status;
            if (response.statusText) msg += ', ' + response.statusText;
            if (response.body) msg += ", server says '" + response.body + "'";
          }
          reject(msg);
        });
    });
  }

  async register(
    doc: Buffer
  ): Promise<{ docHash: string; apiResult: RegisterResponse }> {
    const docHash: string = crypto
      .createHash('sha256')
      .update(doc)
      .digest('hex');
    return this.apiRequest('register', {
      hashes: docHash,
      publiclyRetrievable: true,
    }).then((apiResult: APIResponse) => {
      return { docHash: docHash, apiResult: apiResult as RegisterResponse };
    });
  }

  async getSeal(retrievalId: string): Promise<GetSealResponse> {
    return this.apiRequest('getseal', {
      retrievalId: retrievalId,
    }) as Promise<GetSealResponse>;
  }
}
