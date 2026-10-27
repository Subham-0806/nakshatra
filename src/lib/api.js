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
    skill_links: "6add7e7a0030e16581da",
    jobs: "6add7e840010b95bb569",
    job_skills: "6add7e8d003b60aa3f54",
    stages: "6add7e9b001541c01ce2",
    topics: "6add7ea4001905b75a84",
    user_progress: "6add7f9d002ddd72ce52",
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

// Skills and links are required. Jobs and guides are optional, so the sky still loads without them.
export async function loadAll() {
  const [skills, links] = await Promise.all([listAll("skills"), listAll("skill_links")]);
  const optional = async (key) => {
    try {
      return await listAll(key);
    } catch (e) {
      console.warn(`Could not load "${key}":`, e.message);
      return [];
    }
  };
  const [jobs, jobSkills, stages, topics] = await Promise.all([
    optional("jobs"),
    optional("job_skills"),
    optional("stages"),
    optional("topics"),
  ]);
  return { skills, links, jobs, jobSkills, stages, topics };
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

// ---------------- Private progress ----------------
export async function loadMyProgress() {
  const [skillRows, topicRows] = await Promise.all([listAll("user_progress"), listAll("topic_progress")]);
  return { skillRows, topicRows };
}

async function addRow(key, userId, data) {
  return tablesDB.createRow({
    databaseId: CONFIG.databaseId,
    tableId: tableId(key),
    rowId: ID.unique(),
    data: { user_id: userId, ...data },
    permissions: [Permission.read(Role.user(userId)), Permission.delete(Role.user(userId))],
  });
}

async function deleteRow(key, rowId) {
  await tablesDB.deleteRow({ databaseId: CONFIG.databaseId, tableId: tableId(key), rowId });
}

export const saveSkill = (userId, skillId) => addRow("user_progress", userId, { skill_id: skillId });
export const removeSkill = (rowId) => deleteRow("user_progress", rowId);
export const saveTopic = (userId, topicId) => addRow("topic_progress", userId, { topic_id: topicId });
export const removeTopic = (rowId) => deleteRow("topic_progress", rowId);