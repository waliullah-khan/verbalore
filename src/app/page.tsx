import Link from "next/link";

const steps = [
  ["01", "Ideas", "Every morning, five video ideas built from what your market and your pipeline are posting about, each with a real example to learn from."],
  ["02", "Record", "Pick one. The script is on the teleprompter, so there is nothing to research or write. Record in one take."],
  ["03", "Edit", "A saved template drops your words into a finished cut, with a graphic on every scene. Under three minutes."],
  ["04", "Post", "Send it to every platform from one place, or to the one person in your CRM it was made for."],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-8">
      <nav className="flex items-center justify-between">
        <span className="display text-xl">Verbalore</span>
        <Link href="/login" className="btn btn-ghost">Request access</Link>
      </nav>

      <section className="pt-20 sm:pt-28">
        <p className="eyebrow">Video, without the blank page</p>
        <h1 className="mt-4 max-w-3xl text-5xl leading-[1.05] sm:text-7xl">
          Show up on camera every day. We do the rest.
        </h1>
        <p className="muted mt-6 max-w-xl text-lg">
          Verbalore finds what your market is talking about, writes the script in your voice, prompts you while you record,
          and edits the video before you finish your coffee. It also watches your CRM and turns every buying signal into a personal video note.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/demo" className="btn btn-primary">Open the demo workspace</Link>
          <Link href="/login" className="btn btn-ghost">Request access</Link>
        </div>
      </section>

      <section className="mt-24 grid gap-4 sm:grid-cols-2">
        {steps.map(([n, title, body]) => (
          <div key={n} className="card">
            <p className="eyebrow">{n}</p>
            <h2 className="mt-2 text-2xl">{title}</h2>
            <p className="muted mt-2">{body}</p>
          </div>
        ))}
      </section>

      <section className="card mt-4">
        <p className="eyebrow">Signals</p>
        <h2 className="mt-2 text-2xl">The account-based side</h2>
        <p className="muted mt-2 max-w-2xl">
          A funding round, a new VP, a hiring spike. Verbalore spots the change on an account in your pipeline and drafts a 30 second video note
          for the right contact, so you reach out the day it matters instead of the quarter after.
        </p>
      </section>
    </main>
  );
}
