import { Link } from '@/components/link';

export default function Page() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">
        Vercel AI SDK Fundamentals with Portkey AI
      </h1>
      <p>
        The following examples aim to showcase the fundamentals behind the
        Vercel AI SDK. The examples have minimal loading states to remain as
        simple as possible.
      </p>
      <p>
        The prompt for the first 2 examples (stream/generate text) is `Tell me a
        joke`.
      </p>
      <ul className="list-disc list-inside">
        <li>
          <Link href="/examples/generate-text">Generate Text</Link>
        </li>
        <li>
          <Link href="/examples/stream-text">Stream Text</Link>
        </li>
        <li>
          <Link href="/examples/tools/basic">Basic Tool</Link>
        </li>
        <li>
          <Link href="/examples/basic-chatbot">Chatbot with `useChat`</Link>
        </li>
      </ul>
    </main>
  );
}
