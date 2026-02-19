import ai21 from './ai21.json';
import anthropic from './anthropic.json';
import anyscale from './anyscale.json';
import azureAi from './azure-ai.json';
import azureOpenai from './azure-openai.json';
import bedrock from './bedrock.json';
import cerebras from './cerebras.json';
import cohere from './cohere.json';
import dashscope from './dashscope.json';
import deepbricks from './deepbricks.json';
import deepinfra from './deepinfra.json';
import deepseek from './deepseek.json';
import fireworksAi from './fireworks-ai.json';
import google from './google.json';
import groq from './groq.json';
import jina from './jina.json';
import mistralAi from './mistral-ai.json';
import monsterapi from './monsterapi.json';
import moonshot from './moonshot.json';
import nebius from './nebius.json';
import nomic from './nomic.json';
import novitaAi from './novita-ai.json';
import openai from './openai.json';
import openrouter from './openrouter.json';
import oracle from './oracle.json';
import palm from './palm.json';
import perplexityAi from './perplexity-ai.json';
import predibase from './predibase.json';
import rekaAi from './reka-ai.json';
import sagemaker from './sagemaker.json';
import segmind from './segmind.json';
import stabilityAi from './stability-ai.json';
import togetherAi from './together-ai.json';
import vertexAi from './vertex-ai.json';
import workersAi from './workers-ai.json';
import xAi from './x-ai.json';
import zhipu from './zhipu.json';

const providers: Record<string, any> = {
  ai21,
  anthropic,
  anyscale,
  'azure-ai': azureAi,
  'azure-openai': azureOpenai,
  bedrock,
  cerebras,
  cohere,
  dashscope,
  deepbricks,
  deepinfra,
  deepseek,
  'fireworks-ai': fireworksAi,
  google,
  groq,
  jina,
  'mistral-ai': mistralAi,
  monsterapi,
  moonshot,
  nebius,
  nomic,
  'novita-ai': novitaAi,
  openai,
  openrouter,
  oracle,
  palm,
  'perplexity-ai': perplexityAi,
  predibase,
  'reka-ai': rekaAi,
  sagemaker,
  segmind,
  'stability-ai': stabilityAi,
  'together-ai': togetherAi,
  'vertex-ai': vertexAi,
  'workers-ai': workersAi,
  'x-ai': xAi,
  zhipu,
};

export { providers };
