import { api } from '@services/api';

export interface ChallengeResponse {
  phrase: string;
}

export const challengesApi = {
  getRandomPhrase: (): Promise<ChallengeResponse> =>
    api.get('/challenges/random').then(r => r.data),
};
