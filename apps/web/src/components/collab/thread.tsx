import { useQueryClient } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { api } from "../../lib/api.ts";
import { type Message, type ThreadType, useChannels, useThread } from "../../lib/collab.ts";
import { Composer } from "./composer.tsx";
import { MessageList } from "./message-list.tsx";

/** Comments on a record (a task, a project), with mentions, reactions and decisions. */
export function Thread({ type, id, placeholder = "Write a comment" }: { type: ThreadType; id: string; placeholder?: string }) {
  const qc = useQueryClient();
  const { data } = useThread(type, id);
  const { data: me } = useChannels();
  const messages = data?.messages ?? [];

  return (
    <div className="space-y-3">
      {messages.length ? (
        <div className="-mx-4">
          <MessageList messages={messages} meId={me?.me} />
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessagesSquare className="size-4" /> No comments yet. Start the conversation.
        </p>
      )}
      <Composer
        placeholder={placeholder}
        onSend={async (body) => {
          const r = await api<{ message: Message }>(`collab/threads/${type}/${id}`, { method: "POST", body: JSON.stringify({ body }) });
          await qc.invalidateQueries({ queryKey: ["thread", type, id] });
          return r.message.id;
        }}
      />
    </div>
  );
}
