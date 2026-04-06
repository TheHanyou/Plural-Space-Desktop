import React, { useState, useEffect } from 'react';
import { Member, ChatChannel, ChatMessage } from '../utils';
import { store, chatMsgKey } from '../storage';

interface Props {
  channels: ChatChannel[];
  members: Member[];
  onClick: () => void;
}

export default function ChatTile({ channels, members, onClick }: Props) {
  const [lastMsg, setLastMsg] = useState<{ msg: ChatMessage; channel: string } | null>(null);

  const getMember = (id: string) => members.find(m => m.id === id);

  useEffect(() => {
    (async () => {
      let latest: { msg: ChatMessage; channel: string } | null = null;
      for (const ch of channels.filter(c => !c.archived)) {
        const msgs = await store.get<ChatMessage[]>(chatMsgKey(ch.id), []);
        if (msgs && msgs.length > 0) {
          const last = msgs[msgs.length - 1];
          if (!latest || last.timestamp > latest.msg.timestamp) {
            latest = { msg: last, channel: ch.name };
          }
        }
      }
      setLastMsg(latest);
    })();
  }, [channels]);

  return (
    <div className="tile" onClick={onClick}>
      <div className="tile__header">
        <div className="tile__glyph">⌨</div>
        <span className="tile__title">System Chat</span>
      </div>
      <div className="tile__body">
        {!lastMsg ? (
          <span className="tile__empty">No messages yet</span>
        ) : (
          <>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>#{lastMsg.channel}</span>
            <div className="tile__chat-author">
              {getMember(lastMsg.msg.authorId)?.name || 'Unknown'}
            </div>
            <div className="tile__chat-msg">
              {lastMsg.msg.content.length > 120
                ? lastMsg.msg.content.slice(0, 120) + '...'
                : lastMsg.msg.content}
            </div>
          </>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 8, fontSize: 11, color: 'var(--muted)' }}>
          {channels.filter(c => !c.archived).length} active channel{channels.filter(c => !c.archived).length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
