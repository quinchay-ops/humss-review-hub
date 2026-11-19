# HUMSS Review Hub — Grade 12, Second Semester

A lightweight static website for GitHub Pages with Firebase Authentication and Cloud Firestore.

## Included
- Student sign-up and login
- Five subjects from the supplied Grade 12 HUMSS semester curriculum guide
- Quarter/unit selection and visible topic coverage
- Multiple choice, fill-in-the-blank, and flashcard modes
- Easy/hard/mixed difficulty filter
- Optional overall session timer and per-item timer
- Immediate feedback and explanations
- End-of-review answer correction page
- Saved student attempts and basic student history
- Separate admin dashboard protected by a Firestore `/admins/{uid}` document

## Important content note
The curriculum map includes all topics and learning competencies listed in the uploaded guide. The included question bank is a starter set to demonstrate the working review engine; it is NOT yet a 500-question complete bank. Add and validate questions topic by topic before using this as a full-semester reviewer. The guide does not list PE 4 Quarter 1–2 topics, so the app uses the guide's PE 4 Quarter 3 and Quarter 4 structure and does not invent earlier-quarter topics.

## 1. Create Firebase project
1. Open https://console.firebase.google.com/ and create a project.
2. Add a Web App and copy its Firebase configuration.
3. In `app.js`, replace the placeholder values in `firebaseConfig`.
4. In Firebase Authentication → Sign-in method, enable **Email/Password**.
5. In Firestore Database, create a database (production mode is fine).

## 2. Publish Firestore security rules
1. Open Firestore Database → Rules.
2. Replace the rules with the contents of `firestore.rules`.
3. Publish.

## 3. Create your admin account
1. Open your website and sign up using your own email.
2. In Firebase Console → Authentication → Users, copy your account's UID.
3. In Firestore → Data, create a collection named `admins`.
4. Add a document whose document ID is exactly your UID. It can contain a field such as `createdAt` (string) with value `owner`.
5. Sign out and sign in again. Open your website with `/#admin` appended to the URL to open the admin dashboard.
6. Do not create an admin signup button. Admin status is assigned manually in Firebase.

## 4. GitHub Pages
1. Create a GitHub repository, e.g. `humss-review-hub`.
2. Upload `index.html`, `styles.css`, `app.js`, `question-bank.js`, and `firestore.rules` (README may also be uploaded).
3. In repository Settings → Pages, select **Deploy from a branch**, choose `main` and `/ (root)`, then Save.
4. Wait for GitHub Pages to publish the site.

## Data model
- `users/{uid}`: student profile
- `users/{uid}/attempts/{attemptId}`: saved review result
- `admins/{uid}`: administrator allowlist document

## Limitations / next development pass
- The admin dashboard currently shows a recent activity sample (up to five recent attempts per student), not a complete analytics export.
- Fill-in-the-blank uses normalized exact matching; acceptable alternate answers should be added to the question schema in a future pass.
- Flashcard self-rating is stored as known / needs review, not as a graded test score.
- A starter bank is included. Build out the remaining per-topic question sets to reach the planned 500+ question bank, with expert review of factual accuracy.
- Firebase free-tier limits and security rules apply. Review privacy requirements before inviting a large group of students.
