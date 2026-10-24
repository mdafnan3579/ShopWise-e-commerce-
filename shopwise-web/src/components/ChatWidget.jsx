import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, RotateCcw, Send, Sparkles, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Link } from 'react-router';
import { aiApi, orderApi } from '../api/endpoints.js';
import { errorMessage } from '../lib/api.js';
import { formatPrice, primaryImage } from '../lib/format.js';
import { streamChat } from '../lib/chat.js';
import { useAuthStore } from '../stores/authStore.js';
import { Price, Spinner } from './ui.jsx';

const SESSION_KEY = 'shopwise-chat-session';
const TOOL_LABELS = {
  search_products: 'Searching products…',
  get_product_details: 'Reading product details…',
  compare_products: 'Comparing products…',
  check_stock: 'Checking stock…',
  show_products: 'Picking products…',
  get_store_policy: 'Checking store policy…',
  list_my_orders: 'Looking up your orders…',
  get_order_details: 'Reading your order…',
  request_order_cancellation: 'Checking the order…',
  create_support_ticket: 'Contacting the support team…',
};
const SUGGESTIONS = [
  'Gift ideas for a runner under $100',
  'Where is my latest order?',
  'What’s your return policy?',
];

const storage = {
  get: () => {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set: (id) => {
    try {
      if (id) localStorage.setItem(SESSION_KEY, id);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

function ChatProducts({ products }) {
  return (
    <div className="mt-2 grid gap-2">
      {products.map((p) => (
        <Link
          key={p._id}
          to={`/products/${p.slug}`}
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 hover:border-brand-300"
        >
          {primaryImage(p) && (
            <img src={primaryImage(p)} alt="" className="size-12 rounded-md object-cover" />
          )}
          <span className="min-w-0 flex-1">
            <span className="line-clamp-1 text-sm font-medium">{p.name}</span>
            <Price cents={p.priceCents} className="text-sm text-brand-700" />
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * The assistant can only *offer* a cancellation. Nothing changes until the customer clicks,
 * and the click calls the normal cancel endpoint (API.md §5 `action` event).
 */
function CancelOrderAction({ action }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState('offered'); // offered → done | kept
  const cancel = useMutation({
    mutationFn: () => orderApi.cancel(action.orderId),
    onSuccess: () => {
      setState('done');
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-order', action.orderId] });
    },
  });

  if (state === 'done') {
    return <p className="mt-2 text-xs text-emerald-700">Order {action.orderNumber} cancelled.</p>;
  }
  if (state === 'kept') {
    return <p className="mt-2 text-xs text-slate-500">Order {action.orderNumber} was kept.</p>;
  }
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <p>
        Cancel order <span className="font-medium">{action.orderNumber}</span> (
        {formatPrice(action.totalCents)})?
      </p>
      {cancel.isError && <p className="mt-1 text-xs text-red-700">{errorMessage(cancel.error)}</p>}
      <div className="mt-2 flex gap-2">
        <button
          className="btn-primary px-3 py-1.5 text-xs"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          {cancel.isPending ? 'Cancelling…' : 'Yes, cancel it'}
        </button>
        <button
          className="btn-secondary px-3 py-1.5 text-xs"
          disabled={cancel.isPending}
          onClick={() => setState('kept')}
        >
          Keep order
        </button>
      </div>
    </div>
  );
}

function Message({ message }) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white">
        {message.content}
      </div>
    );
  }
  return (
    <div className="max-w-[92%]">
      <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm">
        {message.content ? (
          <div className="prose-chat">
            <Markdown>{message.content}</Markdown>
          </div>
        ) : (
          <span className="flex items-center gap-2 text-slate-500">
            <Spinner className="size-4" /> {message.tool ? TOOL_LABELS[message.tool] : 'Thinking…'}
          </span>
        )}
        {message.content && message.tool && message.streaming && (
          <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Spinner className="size-3" /> {TOOL_LABELS[message.tool]}
          </span>
        )}
      </div>
      {message.notice && <p className="mt-1 text-xs text-amber-700">{message.notice}</p>}
      {message.products?.length > 0 && <ChatProducts products={message.products} />}
      {message.actions?.map((action) =>
        action.type === 'cancel_order' ? (
          <CancelOrderAction key={action.orderId} action={action} />
        ) : null,
      )}
    </div>
  );
}

export function ChatWidget() {
  const authStatus = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?._id);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(storage.get);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const loadedFor = useRef(null);

  // Sessions belong to a user or a guest cookie, so a change of identity starts fresh.
  const identity = authStatus === 'authenticated' ? userId : authStatus;
  const lastIdentity = useRef(identity);
  useEffect(() => {
    if (lastIdentity.current === identity) return;
    const wasLoading = lastIdentity.current === 'loading';
    lastIdentity.current = identity;
    if (wasLoading) return;
    abortRef.current?.abort();
    storage.set(null);
    setSessionId(null);
    setMessages([]);
    loadedFor.current = null;
  }, [identity]);

  // Reload an earlier conversation the first time the panel opens.
  useEffect(() => {
    if (!open || !sessionId || loadedFor.current === sessionId || authStatus === 'loading') return;
    loadedFor.current = sessionId;
    setLoadingHistory(true);
    aiApi
      .chatSession(sessionId)
      .then((session) =>
        setMessages(
          session.messages.map((m) => ({
            role: m.role,
            content: m.content,
            products: m.productIds ?? [],
          })),
        ),
      )
      .catch(() => {
        storage.set(null);
        setSessionId(null);
      })
      .finally(() => setLoadingHistory(false));
  }, [open, sessionId, authStatus]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  const updateLast = (patch) =>
    setMessages((msgs) => {
      const copy = [...msgs];
      const last = copy[copy.length - 1];
      copy[copy.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) };
      return copy;
    });

  const send = async (text) => {
    const message = text.trim();
    if (!message || streaming) return;
    setInput('');
    setMessages((msgs) => [
      ...msgs,
      { role: 'user', content: message },
      { role: 'assistant', content: '', products: [], streaming: true },
    ]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat({
        message,
        sessionId: sessionId ?? undefined,
        signal: controller.signal,
        onEvent: (event, data) => {
          if (event === 'session' || event === 'done') {
            setSessionId(data.sessionId);
            loadedFor.current = data.sessionId;
            storage.set(data.sessionId);
          }
          if (event === 'tool') updateLast({ tool: data.name });
          if (event === 'text')
            updateLast((m) => ({ content: m.content + data.delta, tool: null }));
          if (event === 'products') updateLast({ products: data.products });
          if (event === 'action') updateLast((m) => ({ actions: [...(m.actions ?? []), data] }));
          if (event === 'error') {
            updateLast((m) => ({
              notice: 'The AI assistant is limited right now, so here are some popular picks.',
              content: m.content ? `${m.content}\n\n` : '',
            }));
          }
        },
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        updateLast((m) => ({ content: m.content || '_Stopped._' }));
      } else {
        if (err?.code === 'NOT_FOUND') {
          storage.set(null);
          setSessionId(null);
        }
        updateLast({
          content: err?.message ?? 'Sorry, something went wrong. Please try again.',
          notice:
            err?.code === 'RATE_LIMITED' ? 'You’re sending messages quickly; wait a moment.' : null,
        });
      }
    } finally {
      updateLast({ streaming: false, tool: null });
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const newChat = () => {
    abortRef.current?.abort();
    if (sessionId) aiApi.deleteChatSession(sessionId).catch(() => {});
    storage.set(null);
    setSessionId(null);
    setMessages([]);
    loadedFor.current = null;
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-brand-700"
      >
        <MessageCircle className="size-5" /> Ask ShopWise AI
      </button>
    );
  }

  return (
    <section
      className="fixed inset-x-2 bottom-2 z-40 flex h-[min(620px,calc(100vh-1rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96"
      aria-label="Shopping and support assistant"
    >
      <header className="flex items-center gap-2 border-b border-slate-200 bg-brand-600 px-4 py-3 text-white">
        <Sparkles className="size-5" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold">ShopWise assistant</h2>
          <p className="text-xs text-brand-100">
            AI-generated answers. Check details before buying.
          </p>
        </div>
        <button onClick={newChat} className="rounded p-1 hover:bg-white/15" aria-label="New chat">
          <RotateCcw className="size-4" />
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded p-1 hover:bg-white/15"
          aria-label="Close chat"
        >
          <X className="size-5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {loadingHistory && <Spinner className="mx-auto size-5" />}
        {!loadingHistory && messages.length === 0 && (
          <div className="text-sm text-slate-600">
            <p>
              Hi! I can find and compare products for you, and help with your orders, shipping,
              returns and refunds.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} message={m} />
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <input
          className="input"
          placeholder="Ask about products or your orders…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          aria-label="Message"
        />
        {streaming ? (
          <button
            type="button"
            className="btn-secondary px-3"
            onClick={() => abortRef.current?.abort()}
            aria-label="Stop"
          >
            <Square className="size-4" />
          </button>
        ) : (
          <button
            type="submit"
            className="btn-primary px-3"
            disabled={!input.trim()}
            aria-label="Send"
          >
            <Send className="size-4" />
          </button>
        )}
      </form>
    </section>
  );
}
