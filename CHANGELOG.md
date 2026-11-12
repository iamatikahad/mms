# Changelog

## 1.4.0 — Royal Black & Gold Premium Branding

### Added
- **Unified design system**: CSS-variable theme engine (`data-theme` on `<html>`) with 8 palettes — Royal Black & Gold (default), Royal Navy & Silver, Emerald Luxury, Burgundy Royale, Champagne Minimal, Graphite Copper, Midnight Violet, Arctic Mint — each with light + dark variants.
- **Theme Settings gallery** in Admin Settings: live swatch previews, one-click apply, reset to default. Per-device persistence via localStorage (`ui_theme`); default = Royal + dark mode.
- **New brand logo**: gold "M" monogram emblem on black (`Logo.tsx`, `favicon.svg`) used in sidebar, header, login.

### Changed
- Core surfaces retinted via CSS vars: page background, cards, inputs, buttons (gold gradient primary), tables, labels, page titles, scrollbars, sidebar/header — applied site-wide without touching business logic.
- Default mode now dark (Royal Black & Gold).

### Notes
- No DB changes. No API/business-logic changes. All calculations, auth, Oracle schema untouched.

## 1.3.0 — WhatsApp-Style Messenger + Chat Themes

### Added
- **WhatsApp-inspired messenger UI**: sidebar with profile header + search + conversation list; chat header with avatar/online status; chat wallpaper background; WhatsApp-style bubbles (incoming/outgoing, tails, day pills); fixed composer with emoji/attach/send; mobile list→chat navigation; per-conversation ⋮ menu.
- **12 default chat themes**: WhatsApp Classic Green, Ocean Blue, Midnight Dark, Pure Black AMOLED, Sunset Orange, Rose Pink, Lavender Purple, Forest Green, Premium Restaurant Gold, Minimal White, Soft Cream, Royal Purple — each with coordinated wallpaper, bubble, header, composer, text and accent colors.
- **Per-user theme customization** (`/api/chat/theme`, `CHAT_THEME_PREFS`): preset picker with live preview, solid/gradient/image wallpaper, custom incoming/outgoing bubble colors, per-conversation theme override, reset. Persisted in Oracle; strictly per-user (verified user isolation).
- **Conversation mute** (`POST /api/chat/conversations/:id/mute`, `CHAT_MUTES`): per-user mute flag shown in list (🔕) and honored by socket fanout (offline notifications suppressed) and in-app sounds/toasts.

### Changed
- Chat page fully restyled to WhatsApp layout (`wa-*` CSS, theme CSS variables); all messenger features preserved (reply, edit, delete-for-me/everyone, reactions, attachments, receipts, typing, search, unread).
- Calendar/clock widgets remain removed.

### Database
- `database/oracle/migrations/0004_chat_themes.sql` — applied: `CHAT_THEME_PREFS`, `CHAT_MUTES`.

## 1.2.0 — Premium Restaurant Community Messenger

### Added
- **Group chat + private messaging**: all members share the community group; anyone can start a 1:1 conversation from the member list. Backend authorization enforced per conversation.
- **Messenger message features**: reply-to quotes, edit own messages (10-minute window, admin override), Delete for Me / Delete for Everyone ("This message was deleted" placeholder + original attachment access revoked), emoji reactions with per-user counts, copy, image & file attachments (5 MB, PNG/JPG/WEBP/GIF/PDF/TXT/DOC/XLS), image lightbox, load-older pagination, in-chat message search, typing indicators, sent/delivered/read ticks (DMs), online/offline presence with last-seen.
- **Compact live clock + monthly calendar** in the chat sidebar: Asia/Dhaka time, month navigation, today highlight, meal-day dots.
- **Meal request reminders**: scheduler fires 30 min before lunch (09:30) and dinner (19:00) deadlines — in-app notifications + Socket.IO push + browser Notification API + reminder sound; skips members who already submitted; deduped per user/meal/day in `MEAL_REMINDER_LOG` so restarts don't resend.
- **Notification preferences** (per user, persisted in `USER_NOTIFICATION_PREFS`, synced across devices): chat notifications, message sound, meal reminders, login welcome sound + browser-notification enable button in Profile.
- **Login welcome**: spoken "Thank you for using our Mess Management System." (speechSynthesis, chime fallback) once per session on successful login only.
- Messenger-style layout: conversation list + chat pane, mobile list→chat navigation with back button.

### Changed
- Chat is now conversation-based (`CHAT_CONVERSATIONS`, `CHAT_CONVERSATION_MEMBERS`, `CHAT_MESSAGES` with reply/edit/delete/reaction/read metadata). Legacy `CHAT_MESSAGES` rows are migrated into the group conversation.
- Socket.IO: `community` room → per-conversation rooms + `user:<id>` DM rooms; new events (`join_conversation`, `send_message`, `edit_message`, `delete_message`, `react`, `typing`, `message_delivered`, `messages_read`, `presence`, `presence_list`, `chat_message`, `app_notify`, `read_update`).
- `/api/files/:id` now authorizes chat attachments to conversation participants.
- Chat page rewritten as premium messenger UI (grouped bubbles, hover actions, emoji picker, attachment preview).
- Unread badge now counts group + DM conversations via `/api/chat/unread`.

### Database
- `database/oracle/migrations/0003_messenger.sql` — applied to live DB: `CHAT_CONVERSATIONS`, `CHAT_CONVERSATION_MEMBERS`, `CHAT_MESSAGES` (new schema), `CHAT_MESSAGE_DELETES`, `CHAT_REACTIONS`, `USER_NOTIFICATION_PREFS`, `MEAL_REMINDER_LOG`; legacy `CHAT_MESSAGES` renamed to `CHAT_MESSAGES_OLD` and backfilled.

### Fixed
- Calculation audit fixes carried in same release: dashboard meal rate now uses live calc for open months; report detail queries filter `STATUS='ACTIVE'`; member eligibility unified across breakdown/allocation; duplicate meal entries upserted; flowchart food-cost formula corrected.

## 1.1.0 — Community features
- Meal schedule settings (superadmin), meal-request soft delete + re-request, group chat, polls, notifications, dashboard community widgets.

## 1.0.0 — Initial release
- Oracle 12c backend, member/admin/superadmin roles, meals, bazar, bills, deposits, charges, guests, reports, PDF, monthly closing, audit log.
