import NodeCache from 'node-cache';

let memCache: NodeCache | null = null;

export const initializeMemCache = () => {
  memCache = new NodeCache({
    stdTTL: 30,
    checkperiod: 60,
    useClones: false,
  });
};

export default memCache;
