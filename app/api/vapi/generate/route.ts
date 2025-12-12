// /api/vapi-assistant (updated - minimal, safe changes)
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

import { db, auth } from "@/firebase/admin"; // auth added for optional token verification
import { getRandomInterviewCover } from "@/lib/utils";

export async function POST(request: Request) {
    // keep same body shape as before
    const body = await request.json().catch(() => ({}));
    const { type, role, level, techstack, amount, userid } = body;

    try {
        // ----- 1) Optional: Validate incoming VAPI secret header (if configured) -----
        // If you set VAPI_SECRET in your environment, require it. If you haven't set it, skip check.
        const vapiSecretHeader = request.headers.get("x-vapi-secret") || "";
        if (process.env.VAPI_SECRET) {
            if (!vapiSecretHeader || vapiSecretHeader !== process.env.VAPI_SECRET) {
                console.error("Unauthorized: missing or invalid x-vapi-secret");
                return Response.json({ success: false, error: "Unauthorized VAPI request" }, { status: 401 });
            }
        }

        // ----- 2) Optional: If Authorization header present, verify Firebase token and use verified uid -----
        // This is optional and non-breaking: if no Authorization header is provided, we fall back to the userid from the body.
        let resolvedUserId = userid;
        const authHeader = request.headers.get("authorization") || "";
        const match = authHeader.match(/^Bearer (.+)$/);
        if (match) {
            const idToken = match[1];
            try {
                const decoded = await auth.verifyIdToken(idToken);
                if (decoded && decoded.uid) {
                    resolvedUserId = decoded.uid;
                }
            } catch (err) {
                // If token invalid, log but don't crash — we will fall back to body.userid (to avoid breaking current VAPI payloads)
                console.warn("Token verification failed (falling back to body.userid):", err);
            }
        }

        // ----- 3) Call Gemini (generateText) like before -----
        const llm = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `Prepare questions for a job interview.
The job role is ${role}.
The job experience level is ${level}.
The tech stack used in the job is: ${techstack}.
The focus between behavioural and technical questions should lean towards: ${type}.
The amount of questions required is: ${amount}.
Please return only the questions, without any additional text.
The questions are going to be read by a voice assistant so do not use "/" or "*" or any other special characters which might break the voice assistant.
Return the questions formatted like this:
["Question 1", "Question 2", "Question 3"]`,
            // you may add other options here if needed (temperature, max tokens, etc.)
        });

        // ----- 4) Safely extract text from the LLM response (supports common shapes) -----
        let questionsText: string | undefined;
        if (llm && typeof llm === "object") {
            // attempt common fields
            if ("text" in llm && typeof (llm as any).text === "string") {
                questionsText = (llm as any).text;
            } else if ((llm as any).output && Array.isArray((llm as any).output) && (llm as any).output[0]?.content) {
                // alternate shape: output[0].content[0].text
                const content = (llm as any).output[0].content;
                if (Array.isArray(content) && content[0]?.text) questionsText = content[0].text;
            } else {
                // fallback to stringifying the whole response for parsing attempt
                try {
                    questionsText = JSON.stringify(llm);
                } catch {
                    questionsText = String(llm);
                }
            }
        } else if (typeof llm === "string") {
            questionsText = llm;
        }

        // ----- 5) Try to parse into an array of strings, with safe fallbacks -----
        let questionsArray: string[] = [];
        if (questionsText) {
            // primary attempt: parse JSON array
            try {
                const parsed = JSON.parse(questionsText);
                if (Array.isArray(parsed)) {
                    questionsArray = parsed.map((q: any) => String(q).trim()).filter(Boolean);
                } else if (parsed && parsed.questions && Array.isArray(parsed.questions)) {
                    questionsArray = parsed.questions.map((q: any) => String(q).trim()).filter(Boolean);
                } else {
                    // not a JSON array: fallthrough to fallback parsing
                    throw new Error("Parsed JSON not an array");
                }
            } catch (err) {
                // fallback parsing: extract quoted strings or numbered lines
                // remove surrounding brackets/quotes then split by comma/newline or closing quote patterns
                const fallback = questionsText
                    .replace(/^[\s\[\]"]+|[\s\[\]"]+$/g, "") // trim brackets/quotes
                    .split(/\r?\n|"\s*,\s*"|",\s*"|"\s*,\s*|\s*[,]\s*/)
                    .map(s => s.replace(/^\d+[\).\s-]+/, "").replace(/^["'\s]+|["'\s]+$/g, "").trim())
                    .filter(Boolean);
                questionsArray = Array.from(new Set(fallback)); // unique
            }
        }

        // if still empty, return informative error (LLM didn't produce parseable output)
        if (!questionsArray || questionsArray.length === 0) {
            console.error("LLM did not return questions in a parseable format. Raw LLM output:", questionsText);
            return Response.json({ success: false, error: "LLM did not return questions" }, { status: 502 });
        }

        // ----- 6) Build interview object (keeps same fields as before) -----
        const interview = {
            role: role,
            type: type,
            level: level,
            techstack: (typeof techstack === "string" ? techstack.split(",") : Array.isArray(techstack) ? techstack : []).map((s: string) => String(s).trim()),
            questions: questionsArray,
            userId: resolvedUserId, // use verified uid if present, else fallback to provided userid
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString(),
        };

        await db.collection("interviews").add(interview);

        return Response.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("Error in /api/vapi-assistant:", error);
        return Response.json({ success: false, error: String(error) }, { status: 500 });
    }
}

export async function GET() {
    return Response.json({ success: true, data: "Thank you!" }, { status: 200 });
}
