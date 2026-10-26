import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useT } from "./shared";

/*
 * The "? Help" button on every admin screen. It opens a side panel with a short guide,
 * starting on the topic of the screen you are on. All texts are here, in Hebrew and English.
 */

type Topic = "start" | "forms" | "edit" | "responses" | "links";
type Item = { q: [string, string]; a: [string, string] };

const TOPICS: { id: Topic; title: [string, string]; items: Item[] }[] = [
  {
    id: "start",
    title: ["איך זה עובד", "How it works"],
    items: [
      {
        q: ["מה יש כאן?", "What is this?"],
        a: [
          "אזור הניהול של האתר. כאן יוצרים טפסים, משנים אותם, רואים מי נרשם ומורידים הכל לאקסל. אין צורך להיכנס ל-Lovable בשביל כל אלה.",
          "The site's admin area. Here you create and change forms, see who signed up and download everything to Excel. No need to open Lovable for any of this.",
        ],
      },
      {
        q: ["טיוטה ופרסום", "Draft and publish"],
        a: [
          'כל שינוי בטופס נשמר לבד כטיוטה. מי שממלא את הטופס רואה את השינויים רק אחרי שלוחצים "פרסום השינויים". כך אפשר לעבוד בשקט בלי לשבור את הטופס שבאוויר. התגית "יש שינויים שלא פורסמו" מזכירה שיש משהו שעוד לא עלה.',
          'Every change saves itself as a draft. People filling in the form see changes only after you click "Publish changes", so you can work calmly without breaking the live form. The "Unpublished changes" tag reminds you something hasn\'t gone live yet.',
        ],
      },
      {
        q: ["התחרטתי על שינוי", "I regret a change"],
        a: [
          'לפני פרסום: "ביטול השינויים" במסך העריכה מחזיר את הטיוטה למה שבאוויר. אחרי פרסום: בלשונית "גרסאות קודמות" לוחצים "שחזור" ליד הגרסה הרצויה, בודקים ולוחצים "פרסום".',
          'Before publishing: "Discard changes" in the editor puts the draft back to what is live. After publishing: in "Version history" click "Restore" next to the version you want, check it and click "Publish".',
        ],
      },
      {
        q: ["כניסה ויציאה", "Signing in and out"],
        a: [
          'נכנסים מהקישור ‎/manage‎ עם הקוד. אחרי 5 קודים שגויים הכניסה ננעלת ל-10 דקות. "התנתקות" למעלה יוצאת מהמכשיר הזה.',
          'Sign in from the /manage link with the code. After 5 wrong codes, entry locks for 10 minutes. "Sign out" at the top signs out of this device.',
        ],
      },
      {
        q: ["אנגלית / עברית", "English / Hebrew"],
        a: [
          "הכפתור בפינה מחליף את שפת אזור הניהול בלבד. הטפסים עצמם נשארים בשפה שבה כתבתם אותם.",
          "The corner button switches the admin area's language only. The forms stay in the language you wrote them in.",
        ],
      },
    ],
  },
  {
    id: "forms",
    title: ["הטפסים שלי", "My forms"],
    items: [
      {
        q: ["טופס חדש", "New form"],
        a: [
          '"+ טופס חדש": נותנים שם, בוחרים אם להתחיל מטופס ריק, מטופס ההצטרפות או מעותק של טופס קיים, ובוחרים עיצוב. אפשר לשנות הכל אחר כך.',
          '"+ New form": give it a name, start blank, from the join form or from a copy of an existing form, and pick a design. Everything can be changed later.',
        ],
      },
      {
        q: ["התפריט של כל טופס (⋯)", "Each form's menu (⋯)"],
        a: [
          "העתקת הקישור, העתקת הקישור הקצר, פתיחה, שכפול, פתיחה או סגירה לתגובות, הצגה בעמוד הבית ומחיקה. מחיקה מוחקת גם את כל התגובות ולא ניתנת לביטול.",
          "Copy link, copy tiny link, open, duplicate, open or close for responses, show on the home page and delete. Deleting also deletes all responses and can't be undone.",
        ],
      },
      {
        q: ["עמוד הבית של האתר", "The site's home page"],
        a: [
          'טופס אחד מוצג בכתובת הראשית של האתר. בוחרים איזה בתפריט של הטופס או בלשונית "עיצוב והגדרות".',
          "One form is shown at the site's main address. Choose which one in the form's menu or in \"Design & settings\".",
        ],
      },
    ],
  },
  {
    id: "edit",
    title: ["עריכת טופס", "Editing a form"],
    items: [
      {
        q: ["שאלות", "Questions"],
        a: [
          'לוחצים על שאלה כדי לפתוח אותה. אפשר לשנות כותרת, סוג, הסבר, חובה, להזיז, לשכפל ולמחוק. בשאלות בחירה, "הדבקת רשימה שלמה" מוסיפה הרבה אפשרויות בבת אחת (כל אחת בשורה).',
          'Click a question to open it. Change its title, type, help text and whether it\'s required; move, duplicate or delete it. For choice questions, "Paste a whole list" adds many options at once (one per line).',
        ],
      },
      {
        q: ["טקסטים", "Texts"],
        a: [
          'כל המילים בדף: הכותרות, פסקת הפתיחה, כפתור השליחה, הודעת התודה והודעת "הטופס סגור". אפשר גם להוסיף כפתור במסך התודה, למשל לקבוצת וואטסאפ.',
          'Every word on the page: headings, intro, submit button, thank-you message and "form closed" message. You can also add a button on the thank-you screen, e.g. to a WhatsApp group.',
        ],
      },
      {
        q: ["עיצוב והגדרות", "Design & settings"],
        a: [
          "עיצוב וצבע (משתנים מיד), הקישור של הטופס, קישור קצר, פתיחה/סגירה, סגירה אוטומטית בתאריך או אחרי מספר תגובות, קישור לתצוגה מקדימה, ואילו עמודות יופיעו ברשימת התגובות.",
          "Design and color (change right away), the form's link, tiny link, open/close, automatic closing by date or number of responses, preview link, and which columns show in the responses list.",
        ],
      },
      {
        q: ["תצוגה מקדימה", "Preview"],
        a: [
          'בצד המסך (או בכפתור "תצוגה מקדימה" בטלפון) רואים את הטיוטה בדיוק כמו שהיא תיראה. כדי שמישהו אחר יבדוק לפני פרסום, יוצרים "קישור לתצוגה מקדימה" ושולחים לו.',
          'The side of the screen (or the "Preview" button on a phone) shows the draft exactly as it will look. For someone else to check before publishing, create a "Preview link" and send it.',
        ],
      },
      {
        q: ["סגירה אוטומטית", "Automatic closing"],
        a: [
          'בוחרים תאריך ושעה ו/או מספר תגובות מקסימלי. כשמגיעים לאחד מהם, הטופס מציג את הודעת "הטופס סגור". נכנס לתוקף אחרי פרסום.',
          'Pick a date and time and/or a maximum number of responses. When either is reached, the form shows its "form closed" message. Takes effect after publishing.',
        ],
      },
    ],
  },
  {
    id: "responses",
    title: ["תגובות", "Responses"],
    items: [
      {
        q: ["לראות מי נרשם", "Seeing who signed up"],
        a: [
          'לוחצים על שורה כדי לראות את כל הפרטים, הקבצים, ולחייג או לשלוח וואטסאפ ישר מהמסך. "לא נפתח" מסמן תגובות שעוד לא פתחתם במכשיר הזה. הדף מתרענן לבד כל 30 שניות.',
          'Click a row to see all details and files, and call or WhatsApp straight from the screen. "Unopened" marks responses you haven\'t opened on this device. The page refreshes itself every 30 seconds.',
        ],
      },
      {
        q: ["סטטוס והערות", "Status and notes"],
        a: [
          "לכל תגובה בוחרים סטטוס: חדש, בטיפול, אושר או לא רלוונטי, וכותבים הערה פנימית. רק אנשי הניהול רואים אותם. אפשר לסנן את הרשימה לפי סטטוס.",
          "Give each response a status: new, in progress, approved or not relevant, and write a private note. Only admins see them. You can filter the list by status.",
        ],
      },
      {
        q: ["עריכה והוספה ידנית", "Editing and adding by hand"],
        a: [
          '"עריכת התשובות" בתוך תגובה מתקנת טעויות. "+ הוספה ידנית" מוסיפה מישהו שנרשם בטלפון או בוואטסאפ. אין שדות חובה בשני המקרים.',
          '"Edit answers" inside a response fixes mistakes. "+ Add manually" adds someone who signed up by phone or WhatsApp. Nothing is required in either case.',
        ],
      },
      {
        q: ["כפולים", "Duplicates"],
        a: [
          '"כפול?" מופיע כשיש לתגובה אותו טלפון או מייל כמו לתגובה אחרת באותו טופס. בתוך התגובה יש קישור לתגובה השנייה. מוחקים אחת או מסמנים "לא רלוונטי".',
          '"Duplicate?" shows when a response has the same phone or email as another one in the same form. Inside it there\'s a link to the other one. Delete one or mark it "Not relevant".',
        ],
      },
      {
        q: ["אקסל וסטטיסטיקות", "Excel and stats"],
        a: [
          '"ייצוא לאקסל" מוריד את מה שמוצג כרגע (אחרי חיפוש וסינון), כולל סטטוס, הערות וקישורים לקבצים. "סיכום וסטטיסטיקות" מראה גרף לפי ימים ותשובות לכל שאלה.',
          '"Export to Excel" downloads what is shown right now (after search and filters), including status, notes and links to files. "Summary & stats" shows a per-day chart and the answers to each question.',
        ],
      },
    ],
  },
  {
    id: "links",
    title: ["קישורים", "Links"],
    items: [
      {
        q: ["הקישור של הטופס", "The form's link"],
        a: [
          'כל טופס מקבל כתובת באתר, למשל ‎/hafakot-2027‎. משנים אותה ב"עיצוב והגדרות". אחרי שינוי, קישור ישן שכבר נשלח יפסיק לעבוד, אז עדיף לקבוע אותו לפני ששולחים.',
          'Each form gets an address on the site, e.g. /hafakot-2027. Change it in "Design & settings". After a change, an old link you already sent stops working, so settle it before sending.',
        ],
      },
      {
        q: ["קישור קצר (is.gd)", "Tiny link (is.gd)"],
        a: [
          "קישור כמו is.gd/singles2027 שמסתיר את הכתובת הארוכה. קישור קצר הוא קבוע ולא ניתן לשינוי או מחיקה. כל הקישורים הקצרים נשמרים ברשימה משותפת בעמוד הראשי של הניהול.",
          "A link like is.gd/singles2027 that hides the long address. A tiny link is permanent and can't be changed or deleted. All tiny links are kept in a shared list on the admin home page.",
        ],
      },
      {
        q: ["קיצור כל קישור", "Shortening any link"],
        a: [
          'בעמוד הראשי של הניהול, "קיצור קישור" עובד על כל כתובת, לא רק על טפסים: מדביקים, בוחרים שם, ומעתיקים.',
          'On the admin home page, "Shorten a link" works for any address, not just forms: paste, pick a name, copy.',
        ],
      },
    ],
  },
];

function topicFor(path: string): Topic {
  if (/\/edit\/?$/.test(path)) return "edit";
  if (/\/admin\/forms\//.test(path)) return "responses";
  return "forms";
}

export function HelpButton() {
  const t = useT();
  const pick = (x: [string, string]) => t(x[0], x[1]);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<Topic>(() => topicFor(path));

  useEffect(() => {
    if (open) setTopic(topicFor(path));
  }, [open, path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const current = TOPICS.find((x) => x.id === topic)!;

  return (
    <>
      <button
        className="help-fab"
        onClick={() => setOpen(true)}
        aria-label={t("עזרה והסברים", "Help")}
      >
        <span aria-hidden="true">?</span> {t("עזרה", "Help")}
      </button>
      {open && (
        <div className="overlay help-overlay" onClick={() => setOpen(false)}>
          <aside
            className="panel help-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t("עזרה", "Help")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-top">
              <b>{t("עזרה והסברים", "Help & how-to")}</b>
              <button
                className="icon"
                onClick={() => setOpen(false)}
                aria-label={t("סגירה", "Close")}
              >
                ×
              </button>
            </div>
            <nav className="help-topics" aria-label={t("נושאים", "Topics")}>
              {TOPICS.map((x) => (
                <button
                  key={x.id}
                  className={x.id === topic ? "on" : ""}
                  aria-pressed={x.id === topic}
                  onClick={() => setTopic(x.id)}
                >
                  {pick(x.title)}
                </button>
              ))}
            </nav>
            <h2>{pick(current.title)}</h2>
            <dl className="help-items">
              {current.items.map((it) => (
                <div key={it.q[1]}>
                  <dt>{pick(it.q)}</dt>
                  <dd>{pick(it.a)}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      )}
    </>
  );
}
