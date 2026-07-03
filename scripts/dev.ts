const commands = [
  ["server", ["run", "server:dev"]],
  ["client", ["run", "client:dev"]]
] as const;

const children = commands.map(([name, args]) => {
  const child = Bun.spawn(["bun", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit"
  });

  pipeWithPrefix(name, child.stdout);
  pipeWithPrefix(name, child.stderr);

  return child;
});

function pipeWithPrefix(name: string, stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  void (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      const text = decoder.decode(value);
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) console.log(`[${name}] ${line}`);
      }
    }
  })();
}

const shutdown = () => {
  for (const child of children) child.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race(children.map((child) => child.exited));
shutdown();

export {};
