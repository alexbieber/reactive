Here's your complete A to Z Cursor plan — copy this and follow it step by step:

---

## Step 1 — Scaffold the project

Open Cursor terminal and run:

```bash
npx create-next-app@latest rn-app-builder \
  --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd rn-app-builder
```

Install all dependencies at once:

```bash
npm install @anthropic-ai/sdk ai @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install @monaco-editor/react jszip framer-motion
npm install lucide-react class-variance-authority clsx tailwind-merge
npm install @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-scroll-area
npm install react-syntax-highlighter @types/react-syntax-highlighter
npm install prettier zustand
npx shadcn-ui@latest init
```

---

## Step 2 — Set up folder structure

Manually create this exact structure inside `/src`:

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (builder)/
│   │   ├── build/
│   │   │   └── page.tsx
│   │   ├── project/
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── projects/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts
│   │   ├── generate/
│   │   │   └── route.ts
│   │   └── export/
│   │       └── route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── builder/
│   │   ├── PromptInput.tsx
│   │   ├── ChatFlow.tsx
│   │   ├── QuestionCard.tsx
│   │   ├── CodeViewer.tsx
│   │   ├── FileExplorer.tsx
│   │   └── PreviewPane.tsx
│   ├── landing/
│   │   ├── Hero.tsx
│   │   ├── Features.tsx
│   │   └── ExampleChips.tsx
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Footer.tsx
│   └── ui/          ← shadcn drops components here
├── lib/
│   ├── claude.ts
│   ├── prompts.ts
│   ├── codegen.ts
│   ├── zipper.ts
│   └── supabase.ts
├── store/
│   └── builderStore.ts
└── types/
    └── index.ts
```

---

## Step 3 — Environment variables

Create `.env.local` at the root:

```env
ANTHROPIC_API_KEY=your_key_here
NEXT_PUBLIC_SUPABASE_URL=your_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

---

## Step 4 — Types first (`src/types/index.ts`)

```typescript
export type BuilderStep = 'prompt' | 'questions' | 'generating' | 'done'

export interface Question {
  id: number
  question: string
  type: 'choice' | 'text'
  options?: string[]
}

export interface Answer {
  questionId: number
  value: string
}

export interface GeneratedFile {
  path: string
  content: string
  language: string
}

export interface Project {
  id: string
  user_id: string
  title: string
  prompt: string
  answers: Answer[]
  files: GeneratedFile[]
  created_at: string
}

export interface BuilderState {
  step: BuilderStep
  prompt: string
  questions: Question[]
  answers: Answer[]
  files: GeneratedFile[]
  activeFile: string | null
  isStreaming: boolean
  error: string | null
}
```

---

## Step 5 — Zustand store (`src/store/builderStore.ts`)

```typescript
import { create } from 'zustand'
import { BuilderState, Question, Answer, GeneratedFile } from '@/types'

interface BuilderStore extends BuilderState {
  setPrompt: (prompt: string) => void
  setStep: (step: BuilderState['step']) => void
  setQuestions: (questions: Question[]) => void
  addAnswer: (answer: Answer) => void
  setFiles: (files: GeneratedFile[]) => void
  setActiveFile: (path: string) => void
  setStreaming: (val: boolean) => void
  setError: (msg: string | null) => void
  reset: () => void
}

const initial: BuilderState = {
  step: 'prompt',
  prompt: '',
  questions: [],
  answers: [],
  files: [],
  activeFile: null,
  isStreaming: false,
  error: null,
}

export const useBuilderStore = create<BuilderStore>((set) => ({
  ...initial,
  setPrompt: (prompt) => set({ prompt }),
  setStep: (step) => set({ step }),
  setQuestions: (questions) => set({ questions }),
  addAnswer: (answer) => set((s) => ({ answers: [...s.answers, answer] })),
  setFiles: (files) => set({ files, activeFile: files[0]?.path ?? null }),
  setActiveFile: (activeFile) => set({ activeFile }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setError: (error) => set({ error }),
  reset: () => set(initial),
}))
```

---

## Step 6 — Claude prompts (`src/lib/prompts.ts`)

```typescript
export const CLARIFICATION_PROMPT = `
You are a senior product manager helping a developer understand their app idea.
Given a user's app description, generate exactly 5 clarifying questions as JSON.

Rules:
- Return ONLY valid JSON, no markdown, no explanation
- Mix of 'choice' and 'text' types
- Keep questions short and friendly
- Questions must be actionable for a developer

Format:
[
  { "id": 1, "question": "...", "type": "choice", "options": ["A", "B", "C"] },
  { "id": 2, "question": "...", "type": "text" }
]
`

export const GENERATION_PROMPT = `
You are a senior React Native developer who writes clean, production-ready Expo code.
Given an app description and user's answers to clarifying questions, generate a complete React Native project.

Rules:
- Use TypeScript everywhere
- Use Expo Router for navigation
- Use NativeWind for styling (Tailwind for RN)
- Use React Query for data fetching if needed
- Generate each file wrapped like this:
  ===FILE: path/to/file.tsx===
  [file content here]
  ===END===
- Include these files minimum:
  app/_layout.tsx, app/index.tsx, app/(tabs)/_layout.tsx,
  components/, constants/theme.ts, package.json, app.json
- Write complete, working code — no placeholders or TODOs
- Add comments only where logic is non-obvious
`

export const REFINEMENT_PROMPT = `
You are a senior React Native developer. The user wants to modify their generated app.
Given the existing files and a change request, output ONLY the files that need to change.
Use the same ===FILE: path=== format.
`
```

---

## Step 7 — Claude wrapper (`src/lib/claude.ts`)

```typescript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function getClarifyingQuestions(prompt: string) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: CLARIFICATION_PROMPT,  // import from prompts.ts
    messages: [{ role: 'user', content: prompt }],
  })
  const text = (msg.content[0] as any).text
  return JSON.parse(text)
}

export async function streamGeneratedApp(
  prompt: string,
  answers: any[],
  onChunk: (chunk: string) => void
) {
  const userMsg = `
App idea: ${prompt}

User's answers:
${answers.map((a) => `Q${a.questionId}: ${a.value}`).join('\n')}

Generate the complete React Native app now.
  `
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 8192,
    system: GENERATION_PROMPT,  // import from prompts.ts
    messages: [{ role: 'user', content: userMsg }],
  })

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      onChunk(chunk.delta.text)
    }
  }
}
```

---

## Step 8 — File parser (`src/lib/codegen.ts`)

```typescript
import { GeneratedFile } from '@/types'

export function parseGeneratedFiles(raw: string): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const regex = /===FILE: (.+?)===\n([\s\S]*?)===END===/g
  let match

  while ((match = regex.exec(raw)) !== null) {
    const path = match[1].trim()
    const content = match[2].trim()
    files.push({
      path,
      content,
      language: getLanguage(path),
    })
  }

  return files
}

function getLanguage(path: string): string {
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.js')) return 'javascript'
  if (path.endsWith('.md')) return 'markdown'
  return 'plaintext'
}
```

---

## Step 9 — Zipper (`src/lib/zipper.ts`)

```typescript
import JSZip from 'jszip'
import { GeneratedFile } from '@/types'

export async function zipFiles(files: GeneratedFile[]): Promise<Blob> {
  const zip = new JSZip()
  files.forEach((file) => {
    zip.file(file.path, file.content)
  })
  return await zip.generateAsync({ type: 'blob' })
}

export function downloadZip(blob: Blob, projectName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
```

---

## Step 10 — API routes

**`src/app/api/chat/route.ts`** — returns clarifying questions:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getClarifyingQuestions } from '@/lib/claude'
import { CLARIFICATION_PROMPT } from '@/lib/prompts'

export async function POST(req: NextRequest) {
  const { prompt } = await req.json()
  if (!prompt) return NextResponse.json({ error: 'No prompt' }, { status: 400 })
  try {
    const questions = await getClarifyingQuestions(prompt)
    return NextResponse.json({ questions })
  } catch (e) {
    return NextResponse.json({ error: 'Claude error' }, { status: 500 })
  }
}
```

**`src/app/api/generate/route.ts`** — streams generated code:
```typescript
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { GENERATION_PROMPT } from '@/lib/prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { prompt, answers } = await req.json()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const userMsg = `App idea: ${prompt}\n\nAnswers:\n${answers
        .map((a: any) => `Q${a.questionId}: ${a.value}`)
        .join('\n')}\n\nGenerate the app.`

      const s = anthropic.messages.stream({
        model: 'claude-sonnet-4-5',
        max_tokens: 8192,
        system: GENERATION_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      })

      for await (const chunk of s) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
```

---

## Step 11 — Supabase setup (`src/lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

Run this SQL in your Supabase dashboard:
```sql
create table projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  prompt text not null,
  answers jsonb default '[]',
  files jsonb default '[]',
  created_at timestamp with time zone default now()
);

alter table projects enable row level security;

create policy "Users can manage own projects"
  on projects for all
  using (auth.uid() = user_id);
```

---

## Step 12 — Landing page (`src/app/page.tsx`)

Build the hero with: badge → headline → subtext → prompt textarea → example chips. Reference fastshot.ai layout: centered, minimal, single CTA. On submit → navigate to `/build?prompt=...`

Key elements:
- Animated gradient text for headline
- Textarea that expands as user types
- Example chips like: "A fitness tracker with workouts", "An Airbnb clone for boats"
- On submit, store prompt in Zustand + push to `/build`

---

## Step 13 — Builder page (`src/app/(builder)/build/page.tsx`)

This page is a **state machine** driven by `step` in the store:

```typescript
'use client'
import { useBuilderStore } from '@/store/builderStore'
import PromptInput from '@/components/builder/PromptInput'
import ChatFlow from '@/components/builder/ChatFlow'
import CodeViewer from '@/components/builder/CodeViewer'

export default function BuildPage() {
  const step = useBuilderStore((s) => s.step)

  return (
    <main>
      {step === 'prompt' && <PromptInput />}
      {step === 'questions' && <ChatFlow />}
      {(step === 'generating' || step === 'done') && <CodeViewer />}
    </main>
  )
}
```

---

## Step 14 — ChatFlow component

This is the conversational Q&A UI. For each question animate it sliding in with Framer Motion. Show one question at a time or all at once depending on UX preference (one at a time is better).

```typescript
// Pseudocode structure
- fetch questions from /api/chat on mount
- render questions array
- each QuestionCard gets onAnswer callback
- once all answered → call /api/generate → setStep('generating')
```

---

## Step 15 — CodeViewer component (3-panel layout)

```
┌─────────────────────────────────────────────────────┐
│  Navbar: project title + Download + New app         │
├──────────────┬──────────────────────┬───────────────┤
│ FileExplorer │   Monaco Editor      │  Expo Preview │
│   sidebar    │   (selected file)    │  (iframe)     │
│   ~200px     │      flex-1          │   ~320px      │
└──────────────┴──────────────────────┴───────────────┘
```

During generation: show a streaming raw output on the right, file explorer populates live as files are parsed.

---

## Step 16 — Expo Snack preview (`src/components/builder/PreviewPane.tsx`)

```typescript
export default function PreviewPane({ files }: { files: GeneratedFile[] }) {
  const snackUrl = buildSnackUrl(files) // encode files into Snack embed URL

  return (
    <iframe
      src={snackUrl}
      style={{ width: '100%', height: '100%', border: 'none' }}
      allow="geolocation; camera; microphone"
    />
  )
}
```

Expo Snack embed URL format:
`https://snack.expo.dev/embedded?code=...&platform=ios&preview=true`

---

## Step 17 — Download button

Wire up the download in the CodeViewer toolbar:
```typescript
import { zipFiles, downloadZip } from '@/lib/zipper'

async function handleDownload() {
  const blob = await zipFiles(files)
  downloadZip(blob, 'my-rn-app')
}
```

---

## Step 18 — Auth (Supabase Google login)

In Supabase dashboard: enable Google OAuth provider, add your domain to allowed URLs.

```typescript
// Login page
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/build` }
})
```

Wrap builder routes in an auth check — redirect to `/login` if no session.

---

## Step 19 — Save project

After generation is done, auto-save to Supabase:
```typescript
async function saveProject() {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('projects').insert({
    user_id: user.id,
    title: extractTitle(prompt),  // Claude can extract a title
    prompt,
    answers,
    files,
  })
}
```

---

## Step 20 — Projects history page

Simple grid of project cards at `/projects`. Each card: app title, date, "Open" button → pushes to `/project/[id]`.

---

## Step 21 — Polish checklist

- [ ] Loading skeletons on all async states
- [ ] Error boundaries + toast notifications (use `sonner`)
- [ ] Empty states (no projects yet)
- [ ] Mobile responsive layout (stack panels vertically on small screens)
- [ ] Rate limiting on API routes (check `x-forwarded-for`, limit 5 generations/hour for free users)
- [ ] `next/font` for typography
- [ ] `<head>` SEO meta tags on landing
- [ ] Favicon + og:image
- [ ] Deploy to Vercel — set all env vars in dashboard

---

## Build order summary

| Order | Task |
|-------|------|
| 1 | Scaffold + install deps |
| 2 | Types + Store |
| 3 | Prompts + Claude lib |
| 4 | API routes (`/api/chat`, `/api/generate`) |
| 5 | Landing page |
| 6 | Builder page state machine |
| 7 | ChatFlow + QuestionCard |
| 8 | CodeViewer + FileExplorer |
| 9 | Monaco Editor |
| 10 | Expo Preview iframe |
| 11 | Download zip |
| 12 | Supabase auth + DB |
| 13 | Save + Projects history |
| 14 | Polish + Deploy |

---

Start with **Step 1 through Step 10** in Cursor before touching any UI. Get the data flow working first — prompt in → questions out → answers in → code streamed out → files parsed. Once that works end-to-end in the terminal/Postman, the UI is just wiring things together. Want me to write any of the components in full?