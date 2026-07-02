<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Pattern;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\Request;

final class PendingPatternSaveService
{
    private const SESSION_KEY = 'pending_pattern_save';
    private const MAX_SVG_BYTES = 2_000_000;

    /**
     * @param array<string, mixed> $payload
     */
    public function storeInSession(Request $request, array $payload): void
    {
        $request->getSession()->set(self::SESSION_KEY, $this->normalizePayload($payload));
    }

    public function hasPendingInSession(Request $request): bool
    {
        return $request->getSession()->has(self::SESSION_KEY);
    }

    public function consumeFromSession(Request $request, User $user, EntityManagerInterface $entityManager): ?Pattern
    {
        $payload = $request->getSession()->get(self::SESSION_KEY);
        if (!is_array($payload)) {
            return null;
        }

        $request->getSession()->remove(self::SESSION_KEY);

        $pattern = $this->createPattern($user, $payload);
        $entityManager->persist($pattern);
        $entityManager->flush();

        return $pattern;
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function createPattern(User $user, array $payload): Pattern
    {
        $normalized = $this->normalizePayload($payload);

        return (new Pattern())
            ->setUser($user)
            ->setMode($normalized['mode'])
            ->setGeometryStyle($normalized['geometryStyle'])
            ->setGeometryParams($normalized['geometryParams'])
            ->setFeatureTimeline($normalized['featureTimeline'])
            ->setSvg($normalized['svg'])
            ->setVoiceProfileHash($normalized['voiceProfileHash'])
            ->setTitle($normalized['title']);
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array{
     *     mode: string,
     *     geometryStyle: string,
     *     geometryParams: array<string, mixed>,
     *     featureTimeline: list<array<string, mixed>>,
     *     svg: string,
     *     voiceProfileHash: ?string,
     *     title: ?string
     * }
     */
    private function normalizePayload(array $payload): array
    {
        $svg = (string) ($payload['svg'] ?? '');
        if ($svg === '') {
            throw new \InvalidArgumentException('svg required');
        }

        if (strlen($svg) > self::MAX_SVG_BYTES) {
            throw new \InvalidArgumentException('svg too large');
        }

        $title = isset($payload['title']) ? trim((string) $payload['title']) : null;
        if ($title === '') {
            $title = null;
        }
        if ($title !== null && mb_strlen($title) > 120) {
            throw new \InvalidArgumentException('title too long');
        }

        return [
            'mode' => (string) ($payload['mode'] ?? 'live'),
            'geometryStyle' => (string) ($payload['geometryStyle'] ?? 'classic'),
            'geometryParams' => is_array($payload['geometryParams'] ?? null) ? $payload['geometryParams'] : [],
            'featureTimeline' => is_array($payload['featureTimeline'] ?? null) ? $payload['featureTimeline'] : [],
            'svg' => $svg,
            'voiceProfileHash' => isset($payload['voiceProfileHash']) ? (string) $payload['voiceProfileHash'] : null,
            'title' => $title,
        ];
    }
}
