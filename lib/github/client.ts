import { Octokit } from '@octokit/rest'

export function octokitFor(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken })
}
