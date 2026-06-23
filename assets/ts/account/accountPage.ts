import { VoiceProfile } from '../audio/VoiceProfile';

type AccountPageData = {
  voiceStatus: string;
  resetVoiceProfile: () => void;
  deletePattern: (id: number) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

export function accountPage(): AccountPageData {
  const profile = new VoiceProfile();

  return {
    voiceStatus: profile.isCalibrated()
      ? `Текущий хеш: ${profile.getHash()}.`
      : 'Профиль ещё формируется — начните сессию на главной.',

    resetVoiceProfile(): void {
      profile.reset();
      this.voiceStatus = 'Профиль сброшен. Новая калибровка начнётся при следующей сессии.';
    },

    async deletePattern(id: number): Promise<void> {
      if (!window.confirm('Удалить этот узор?')) {
        return;
      }

      const response = await fetch(`/api/patterns/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (response.ok || response.status === 204) {
        window.location.reload();
      }
    },

    async deleteAccount(): Promise<void> {
      if (!window.confirm('Удалить аккаунт и все узоры? Это необратимо.')) {
        return;
      }

      const response = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (response.ok || response.status === 204) {
        window.location.href = '/';
      }
    },
  };
}
