/**
 * english-core-vocab — a STARTER high-frequency English core for the graded-reader gate.
 *
 * Provenance (honest): these are well-known, stable high-frequency words — function words plus the
 * most common content words — drawn from the kind of lists every frequency study agrees on (Dolch
 * service words, GSL/NGSL high-frequency, the Oxford 3000 A1 core). This is NOT an authoritative
 * CEFR wordlist; it is the "always-allowed" floor the gate measures against. The check-graded-reader
 * gate treats a word as controlled if it (or a simple inflection of it) is in this core, OR is a
 * declared target-vocabulary word, OR is a proper noun / number, OR is in a project's `allowed_extra`.
 * Anything else is an UNDECLARED beyond-core word, budgeted per CEFR level. Extend per project via
 * the lesson's `allowed_extra` rather than editing this file. Lowercase, base forms only — the gate
 * strips common inflections (-s/-es/-ed/-ing/-d/-er/-est/-ly/-ies→y, contractions) before lookup.
 */

export const CORE = new Set([
  // articles / determiners / quantifiers
  "a", "an", "the", "this", "that", "these", "those", "some", "any", "no", "every", "each", "all",
  "both", "few", "fewer", "little", "many", "much", "most", "more", "less", "least", "other", "another",
  "such", "same", "own", "enough", "several", "either", "neither", "half", "whole",
  // pronouns
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
  "its", "our", "their", "mine", "yours", "hers", "ours", "theirs", "myself", "yourself", "himself",
  "herself", "itself", "ourselves", "themselves", "who", "whom", "whose", "which", "what", "someone",
  "somebody", "something", "anyone", "anybody", "anything", "everyone", "everybody", "everything",
  "nobody", "nothing", "one", "ones",
  // be / have / do / modals
  "be", "am", "is", "are", "was", "were", "been", "being", "have", "has", "had", "having", "do",
  "does", "did", "done", "doing", "will", "would", "shall", "should", "can", "could", "may", "might",
  "must", "ought", "need", "dare", "let", "lets",
  // conjunctions / prepositions
  "and", "or", "but", "so", "nor", "yet", "because", "if", "when", "while", "as", "than", "then",
  "though", "although", "unless", "until", "since", "before", "after", "about", "above", "across",
  "against", "along", "among", "around", "at", "by", "down", "during", "for", "from", "in", "inside",
  "into", "near", "of", "off", "on", "onto", "out", "outside", "over", "past", "through", "to",
  "toward", "towards", "under", "up", "upon", "with", "within", "without", "between", "behind",
  "below", "beside", "beyond", "like", "per",
  // adverbs / connectives
  "not", "no", "yes", "very", "too", "also", "just", "only", "even", "still", "already", "always",
  "never", "often", "sometimes", "usually", "again", "once", "twice", "here", "there", "where",
  "everywhere", "anywhere", "somewhere", "now", "today", "tomorrow", "yesterday", "soon", "late",
  "early", "well", "back", "away", "how", "why", "almost", "quite", "rather", "far", "ago", "ever",
  "maybe", "perhaps", "instead", "however", "therefore", "anyway", "together", "alone", "really",
  "actually", "finally", "suddenly", "slowly", "quickly", "carefully", "loudly", "quietly",
  // high-frequency verbs (base forms)
  "go", "goes", "went", "gone", "going", "come", "came", "get", "got", "give", "gave", "given",
  "take", "took", "taken", "make", "made", "see", "saw", "seen", "look", "want", "need", "know",
  "knew", "known", "think", "thought", "say", "said", "tell", "told", "ask", "find", "found",
  "feel", "felt", "try", "call", "work", "play", "run", "ran", "walk", "talk", "turn", "move",
  "live", "love", "help", "show", "put", "keep", "kept", "begin", "began", "begun", "start", "stop",
  "open", "close", "read", "write", "wrote", "written", "eat", "ate", "eaten", "drink", "drank",
  "sleep", "slept", "stand", "stood", "sit", "sat", "buy", "bought", "pay", "paid", "meet", "met",
  "leave", "left", "bring", "brought", "hold", "held", "hear", "heard", "speak", "spoke", "wait",
  "set", "use", "become", "became", "seem", "happen", "learn", "teach", "taught", "send", "sent",
  "build", "grow", "win", "won", "lose", "lost", "wear", "wore", "fall", "fell", "carry", "watch",
  "follow", "change", "wish", "hope", "remember", "forget", "smile", "laugh", "cry", "answer",
  // high-frequency nouns
  "time", "times", "year", "day", "days", "week", "month", "hour", "minute", "morning", "afternoon",
  "evening", "night", "water", "food", "home", "house", "room", "door", "window", "school", "class",
  "work", "job", "money", "family", "friend", "friends", "man", "men", "woman", "women", "boy",
  "girl", "child", "children", "kid", "people", "person", "place", "city", "town", "country", "world",
  "way", "ways", "thing", "things", "name", "names", "hand", "hands", "eye", "eyes", "head", "face",
  "foot", "feet", "leg", "arm", "car", "road", "street", "tree", "trees", "dog", "cat", "bird",
  "fish", "sun", "moon", "star", "sky", "rain", "snow", "wind", "fire", "light", "number", "game",
  "music", "color", "life", "problem", "question", "answer", "idea", "reason", "end", "part", "side",
  "group", "team", "story", "stories", "book", "books", "word", "words", "letter", "phone", "table",
  "chair", "bed", "box", "bag", "ball", "love", "heart", "mother", "father", "mom", "dad", "baby",
  "brother", "sister", "teacher", "student", "doctor", "shop", "store", "park", "garden", "river",
  "sea", "mountain", "village", "money", "price", "side", "top", "bottom", "front", "middle",
  // high-frequency adjectives
  "good", "bad", "big", "small", "little", "long", "short", "tall", "high", "low", "old", "new",
  "young", "hot", "cold", "warm", "cool", "happy", "sad", "angry", "afraid", "tired", "great",
  "nice", "fine", "right", "wrong", "easy", "hard", "slow", "fast", "full", "empty", "open",
  "clean", "dirty", "true", "false", "ready", "sure", "free", "busy", "different", "important",
  "real", "first", "second", "last", "next", "early", "late", "best", "better", "worse", "worst",
  "beautiful", "pretty", "ugly", "kind", "strong", "weak", "rich", "poor", "dark", "bright", "loud",
  "quiet", "heavy", "light", "deep", "wide", "thick", "thin", "wet", "dry", "soft", "hard", "round",
  // numbers / time words
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
  "twelve", "twenty", "thirty", "fifty", "hundred", "thousand", "million", "many", "first", "last",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  // greetings / fillers commonly in dialogue
  "hello", "hi", "bye", "okay", "ok", "please", "thanks", "thank", "sorry", "mr", "mrs", "ms",
]);

export default CORE;
