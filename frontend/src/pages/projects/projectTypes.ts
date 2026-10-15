// SPDX-License-Identifier: AGPL-3.0-or-later

/** Shapes of the project API. */
export type Member = { name: string; github_username: string | null }
export type ProjectLink = { label: string; url: string }
export type Todo = { id: string; title: string; done: boolean }
export type ProjectFields = {
  name: string
  course_id: number
  deadline_at: string | null
  notes: string
  members: Member[]
  links: ProjectLink[]
  todos: Todo[]
  assignment_ids: number[]
  github_repo: string | null
}
export type Project = ProjectFields & {
  id: number
  course_name: string
  assignments: { id: number; title: string; url: string | null; due_at: string | null }[]
  revision: number
  archived_at: string | null
  created_at: string
  updated_at: string
}
export type ProjectSummary = Pick<Project, 'id' | 'name' | 'course_id' | 'course_name' | 'deadline_at' | 'archived_at'> & {
  todo_count: number
  open_todo_count: number
}
export type GitHubEntry = { title: string; url: string; actor: string | null; at: string | null; state: string | null }
export type GitHubActivity = {
  repository: string
  commits: GitHubEntry[]
  issues: GitHubEntry[]
  pull_requests: GitHubEntry[]
  branches: string[]
  members: { name: string; github_username: string; commits: number; issues: number; pull_requests: number }[]
  fetched_at: string
}
export type MirrorSnapshot = { id: number; repository: string; fetched_at: string; refs_count: number; head: string | null }
export type RepoMatch = { path: string; line: number; excerpt: string }
export type RepoSearch = { snapshot_id: number; head: string; matches: RepoMatch[] }
