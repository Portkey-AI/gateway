'use client';

import { Button } from '@/components/ui/button';
import { generateTextAction } from './action';
import { useState } from 'react';

export default function Page() {
  const [generation, setGeneration] = useState('');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Generate Text Example</h1>
      <Button
        onClick={async () => {
          const result = await generateTextAction();
          setGeneration(result);
        }}
      >
        Tell me a joke
      </Button>
      <pre>{JSON.stringify(generation, null, 2)}</pre>
    </div>
  );
}
