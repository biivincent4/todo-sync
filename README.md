# todo-sync

An Android-first to-do app built with React Native (Expo) and TypeScript. It includes a Kanban board, My Day planning, ideas you keep refining, deliverables, and shared organization workspaces. You sign in with Google, and data syncs in real time through Firebase, including when you're offline.

## Features

### Sign-in and accounts
- Google Sign-In through Firebase Auth. You stay signed in after restarting the app, and you can sign out from Settings.
- Data is kept per user. Firestore and Storage security rules only let a user access workspaces they belong to.

### Workspaces and organizations
- Every user has a **Personal** workspace. Users can also create **Organizations** or join existing ones. A workspace switcher sits at the top of every tab.
- Lists, tasks, ideas, deliverables and My Day all belong to the active workspace. My Day can also include tasks assigned to you in other workspaces; turn this on or off in Settings.
- Roles are **Owner**, **Admin** and **Member**. Owners and admins manage members and workspace settings.
- Invite people by email, or share an invite link or 8-character code. Members can leave, and admins can remove members or change their roles.
- Tasks in an organization can have an assignee, shown as an avatar on the card. Boards have an **Assigned to me** filter. Assignment and status changes appear for every member in real time.

### Tasks and the Kanban board
- Create, edit and delete tasks. Each task has a title, notes, a due date and time, a priority (low, medium or high), a status (To do, Doing or Done), a list, a deliverable, an assignee, attachments and a My Day flag.
- The main view is a board with **To do / Doing / Done** columns:
  - Swipe sideways between columns. The tabs at the top show each column's count.
  - Long-press a card to drag it. Drop it on a column tab, or hold it at the screen edge to move to the next column. There's also a **⋯ → Move to** menu.
  - Each card shows a priority color (red for high, amber for medium, grey for low), the due date and time, the list, the assignee and a 📎 attachment count.
- Each list has its own board. The defaults are Personal and Work, and you can add your own lists.
- Search and filter by status, list, due date (overdue, today, upcoming or no date) and assignee. Filters and sorting apply inside each column.
- **Sorting:**
  - The default is by due date, earliest first. Ties are broken by priority, with high first. Tasks without a due date go at the bottom.
  - You can switch to priority, created date or manual sort. Your choice is saved.
  - You can reorder cards by dragging within a column only in manual sort. Dragging between columns always works.

### Repeating tasks
- Set **Repeat** on any task:
  - every N hours, optionally only within a daily window such as 08:00–20:00
  - several times a day at set times, such as 08:00, 13:00 and 18:00
  - daily or every N days
  - on chosen weekdays, or every N weeks
  - monthly or yearly, every N months or years
- A series can end **never**, **on a date**, or **after N times**.
- Each occurrence is a normal card with a 🔁 badge. Moving it to Done (or tapping **Mark done** on a reminder) creates the next occurrence with the same priority, reminders, list, deliverable, assignee and attachments.
- The next occurrence's id is built from the series id and occurrence number. Completing the same occurrence twice, offline or on two devices, updates one task instead of creating a duplicate.
- If you complete a task late, missed past slots are skipped, so an hourly task never piles up a backlog.
- **⏭ Skip this occurrence** moves on without counting it as done.
- When editing, you choose whether changes apply to **this occurrence** or **all future** ones.
- The task screen shows the pattern, how many occurrences are done or skipped, and your current streak.
- Reminders are only scheduled for the next occurrence. Lead times at least as long as the gap between occurrences are dropped, so an hourly task gets one reminder per hour.
- My Day suggests occurrences that are due today or overdue.

### Sync and offline use
- After the first sign-in, the app works fully offline, including starting with no network. It uses Firestore's local cache and the last-known workspace list saved on the phone.
- Changes made offline show up immediately and sync automatically when you're back online.
- The header shows **☁️ Offline · N changes to sync** while offline, and **Syncing** while queued changes upload. Offline is based on the phone's actual network connection.
- Status changes and card order sync too, and changes from other devices appear in real time.
- Pull down to refresh when online. Offline, the screen keeps showing the saved data.

### My Day
- A board with only the tasks you planned for today. My Day is per user, so in a shared organization each member has their own.
- My Day clears each morning. Unfinished tasks from earlier days come back as suggestions, along with tasks that are overdue, due today or high priority.
- Shows your progress, for example "3 of 5 done".
- An optional morning "Plan your day" notification.

### Reminders by priority
These use Notifee, with an Android notification channel for each priority.

| Priority | Default lead times | Behavior |
|---|---|---|
| High | 1 day, 1 hour, and at the due time | Full-screen alarm with sound and vibration that stays until you dismiss, snooze or mark it done |
| Medium | 1 hour before | Standard notification with sound |
| Low | At the due time | Silent notification |

- Notification actions are **Mark done** and **Snooze**. The full-screen alarm offers snooze for 5, 15 or 60 minutes.
- You can change each priority's lead times, sound and vibration in Settings.
- Editing a task reschedules its reminders. Moving it to Done or deleting it cancels them, and moving it out of Done reschedules them.
- Reminders go to the task's assignee. If a task has no assignee, they go to its creator.

### Ideas
These are rough drafts you keep refining.
- The Ideas tab is separate from the board. Capture a thought quickly as text or a 🎙️ voice note, with no due date or priority needed.
- Each saved edit is kept as a timestamped version. A **History** view lets you browse past versions and restore one.
- Stages are 💭 Raw → 🌱 Developing → ✅ Ready, and you can filter and sort by stage.
- Each idea has a checklist for breaking it into steps, and supports the same attachments as tasks.
- Convert an idea into **one task**, or turn **each checklist step into its own task**. The new tasks link back to the idea, and you can link them to a deliverable.
- An optional weekly "revisit" notification lists ideas you haven't edited in N days. Set N in Settings.

### Deliverables
- A deliverable is an outcome made up of tasks. Its fields are title, description, owner, due date and status (Not started, In progress, Done or At risk).
- Each task can link to one deliverable. Progress rolls up automatically, for example "7 of 12 done (58%)".
- A deliverable is flagged **At risk** automatically when a linked task is overdue, or when its own due date has passed and tasks are still open.
- The Deliverables tab lists deliverables with progress bars. Opening one shows a Kanban board of only its tasks.

### Attachments
These work on both tasks and ideas.
- **Files**, using the document picker.
- **Photos**, from the camera or gallery.
- **Contacts**, with one tap to call, text or email.
- **Links**, which open in the browser.
- **Location**, which opens in Google Maps.
- **Voice notes**, up to 3 minutes.
- Files, photos and audio upload to Firebase Storage. Uploads made offline are queued and sent when you're back online. Each file can be up to 25 MB, and deleting a task deletes its files.
- Each permission is requested only the first time you use that attachment type.

### User experience
- Light and dark themes follow your system setting.
- Every screen has empty, loading and error states.

## Tech
- Expo SDK 58 (React Native 0.88) with TypeScript and Expo Router (`src/app`).
- A dev client is required, because Notifee, React Native Firebase and Google Sign-In use native code. **Expo Go won't work.**
- React Native Firebase handles Auth, Firestore and Storage. `@react-native-google-signin/google-signin` handles Google Sign-In, and `@notifee/react-native` handles notifications.
- Expo modules: `expo-document-picker`, `expo-image-picker`, `expo-contacts`, `expo-audio`, `expo-location` and `expo-file-system`.
- Android builds run through EAS.

```
src/
  app/          Screens (Expo Router). (tabs)/ holds My Day, Board, Deliverables, Ideas, Lists and Settings.
  components/   Kanban board, task card, attachments, shared UI
  context/      Auth, settings, workspace and data providers
  lib/          Pure logic with unit tests: sort, filter, My Day, reminders, ideas, deliverables, permissions
  services/     Firebase, Google auth, notifications, attachments and the upload queue
firestore.rules, storage.rules, firestore.indexes.json, firebase.json
```

### Firestore data model
```
workspaces/{wsId}                 name, type (personal|org), ownerId, members{uid: role}, memberIds[], memberProfiles{}, invitedEmails[], inviteCode
workspaces/{wsId}/tasks/{id}      ...task fields, workspaceId, assigneeId, createdBy, myDay{uid: "YYYY-MM-DD"},
                                  series{id, rule, template}, occurrence, skipped   (repeating tasks; ids {seriesId}~{n})
workspaces/{wsId}/lists/{id}
workspaces/{wsId}/ideas/{id}      ...including versions[], checklist[], convertedTaskIds[]
workspaces/{wsId}/deliverables/{id}
invites/{code}                    workspaceId, workspaceName, createdBy
Storage: workspaces/{wsId}/{tasks|ideas}/{docId}/{file}
```

## Setup

> No Firebase or Google credentials are committed. You need your own Firebase project. `google-services.json` and `.env*` files are git-ignored.

### 1. Install
```bash
npm install
cp .env.example .env.local    # fill in after step 3
```

### 2. Create the Firebase project
1. In the [Firebase console](https://console.firebase.google.com), create a project.
2. Add an **Android app** with the package name `com.todosync.app`. All build profiles use this package; set `ANDROID_PACKAGE` to override it.
3. Turn on **Authentication → Sign-in method → Google**.
4. Create a **Firestore** database in production mode.
5. Turn on **Storage**.

### 3. Add SHA-1 fingerprints and get the OAuth client IDs
Google Sign-In only works when the SHA-1 of the signing key is registered with Firebase.

1. Create the EAS project and keystore:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init                       # links the project; put the ID in EAS_PROJECT_ID if you like
   npx eas-cli@latest credentials -p android     # choose a profile and generate a keystore; it prints the SHA-1
   ```
2. In Firebase, open **Project settings → Your apps → Android app → Add fingerprint**. Add the SHA-1 for each keystore you use: development, preview and production. If you publish on Google Play, also add the **Play App Signing** SHA-1 from the Play Console.
3. Download **`google-services.json`** again (it now contains the OAuth clients) and put it in the project root. It's git-ignored.
4. Copy the **web client ID** (`client_type: 3` in `google-services.json`, or *Google Cloud console → Credentials → Web client*) into `.env.local`:
   ```
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234-abc.apps.googleusercontent.com
   ```

### 4. Deploy the security rules and indexes
```bash
npm install -g firebase-tools
firebase login
firebase use --add            # select your project
firebase deploy --only firestore:rules,firestore:indexes,storage
```
The indexes turn on the collection-group queries that power cross-workspace My Day and reminders. These are tasks where `assigneeId == me`, and unassigned tasks where `createdBy == me`.

Notes on the rules:
- Only members can read or write a workspace and its subcollections. Only owners and admins can change members, roles, invites or settings. There is always exactly one owner.
- Users can join only with a valid invite code for that workspace, or by accepting an invite sent to their verified Google email.
- Assignees and creators can read their own tasks across workspaces, which reminders need. When a member is removed or leaves, the app unassigns their tasks in that workspace and hands their unassigned tasks to the owner, in the same batch. This means nothing in that workspace still matches their queries.
- Storage access is limited to members, and each file to 25 MB.

### 5. Build and run on Android
For EAS cloud builds, upload the git-ignored files as EAS environment variables:
```bash
npx eas-cli@latest env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment development --environment preview --environment production
npx eas-cli@latest env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <web-client-id> --visibility plaintext --environment development --environment preview --environment production
```

Then build:
```bash
# Development client (install the APK on your device or emulator, then run the dev server)
npx eas-cli@latest build -p android --profile development
npm start

# Installable test APK
npx eas-cli@latest build -p android --profile preview

# Play Store bundle
npx eas-cli@latest build -p android --profile production
```
To build locally instead, which needs the Android SDK, run `npx expo run:android`.

#### Local APK build on Windows
Native (C++) builds break when paths are longer than 260 characters, so build from a very short folder such as `C:\t`:
```powershell
robocopy . C:\t /MIR /XD "$PWD\.git" "$PWD\android" "$PWD\.expo"   # includes google-services.json and .env.local
cd C:\t
npx expo prebuild --platform android --clean
cd android
.\gradlew.bat assembleDebug   -PreactNativeArchitectures=arm64-v8a   # dev client, needs `npx expo start --dev-client`
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a   # standalone APK
```
For `assembleRelease`, first add `externalNativeBuild { cmake { buildStagingDirectory = file('C:/c') } }` inside `android { … }` in `android/app/build.gradle`, because the release native folder name is longer. Local builds are signed with `android/app/debug.keystore`, so add that keystore's SHA-1 in Firebase (`.\gradlew.bat signingReport` shows it) or Google Sign-In will fail.

On first launch, allow notifications. On Android 14 and later, also allow **Alarms & reminders** and **full-screen notifications** for todo-sync in system settings, so high-priority alarms can show over the lock screen.

## Development
```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (eslint-config-expo)
npm test            # jest: sorting, filters, My Day suggestions, reminder scheduling,
                    #       idea conversion and versions, deliverable progress and risk, roles,
                    #       recurrence (patterns, windows, end conditions, DST, month-end) and idempotent occurrences
```

Invite links use the scheme `todosync://join?code=XXXXXXXX`.
