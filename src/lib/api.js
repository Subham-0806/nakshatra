import { Client, Account, TablesDB, Query, ID, Permission, Role } from "appwrite";

// ---------------------------------------------------------------
// Fill in the table IDs below (copy each one with the copy icon
// next to the table name in Appwrite). Keep the quotation marks.
// ---------------------------------------------------------------
export const CONFIG = {
  endpoint: "https://sgp.cloud.appwrite.io/v1",
  projectId: "6adafff50032fa60a5ea",
  databaseId: "6add7dfb0030ca0b1126",
  tables: {
    skills: "6add7e5400258f926c02",
    stages: "6add7e9b001541c01ce2",
    topics: "6add7ea4001905b75a84",
    topic_progress: "6add7fec00318a303273",
  },
};

const client = new Client().setEndpoint(CONFIG.endpoint).setProject(CONFIG.projectId);
const account = new Account(client);
const tablesDB = new TablesDB(client);

function tableId(key) {
  const id = CONFIG.tables[key];
  if (!id || id.startsWith("PASTE")) {
    throw new Error(`The table ID for "${key}" is not filled in yet. Open src/lib/api.js and paste it.`);
  }
  return id;
}

async function listAll(key) {
  const res = await tablesDB.listRows({
    databaseId: CONFIG.databaseId,
    tableId: tableId(key),
    queries: [Query.limit(500)],
  });
  return res.rows;
}

// The three tables that describe the learning sky
export async function loadAll() {
  const [skills, stages, topics] = await Promise.all([listAll("skills"), listAll("stages"), listAll("topics")]);
  return { skills, stages, topics };
}

// Used by the #check page to show which tables work.
export async function checkTables() {
  const out = [];
  for (const key of Object.keys(CONFIG.tables)) {
    try {
      const rows = await listAll(key);
      out.push({ name: key, ok: true, count: rows.length });
    } catch (e) {
      out.push({ name: key, ok: false, error: e.message });
    }
  }
  return out;
}

// ---------------- Auth ----------------
export async function getCurrentUser() {
  try {
    return await account.get();
  } catch {
    return null;
  }
}

export async function signUp(name, email, password) {
  await account.create({ userId: ID.unique(), email, password, name });
  await account.createEmailPasswordSession({ email, password });
  return account.get();
}

export async function logIn(email, password) {
  await account.createEmailPasswordSession({ email, password });
  return account.get();
}

export async function logOut() {
  await account.deleteSession({ sessionId: "current" });
}

// ---------------- Private progress (one row per lit topic) ----------------
export async function loadMyProgress() {
  const topicRows = await listAll("topic_progress");
  return { topicRows };
}

export async function saveTopic(userId, topicId) {
  return tablesDB.createRow({
    databaseId: CONFIG.databaseId,
    tableId: tableId("topic_progress"),
    rowId: ID.unique(),
    data: { user_id: userId, topic_id: topicId },
    permissions: [Permission.read(Role.user(userId)), Permission.delete(Role.user(userId))],
  });
}

export async function removeTopic(rowId) {
  await tablesDB.deleteRow({ databaseId: CONFIG.databaseId, tableId: tableId("topic_progress"), rowId });
}
