import { FinetuneRequest } from '../types';

export const AzureTransformFinetuneBody = (body: FinetuneRequest) => {
  const _body = { ...body };

  if (_body.method && !_body.hyperparameters) {
    const hyperparameters =
      _body.method[_body.method.type]?.hyperparameters ?? {};
    _body.hyperparameters = { ...hyperparameters } as any;

    delete _body.method;
  }

  return {
    ..._body,
  };
};
