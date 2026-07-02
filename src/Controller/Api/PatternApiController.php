<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Entity\Pattern;
use App\Entity\User;
use App\Repository\PatternRepository;
use App\Service\PendingPatternSaveService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/patterns')]
final class PatternApiController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly PatternRepository $patterns,
        private readonly PendingPatternSaveService $pendingPatternSave,
    ) {
    }

    #[Route('/pending', name: 'api_patterns_pending', methods: ['POST'])]
    public function pending(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['error' => 'Invalid JSON'], Response::HTTP_BAD_REQUEST);
        }

        try {
            $this->pendingPatternSave->storeInSession($request, $payload);
        } catch (\InvalidArgumentException $exception) {
            return $this->json(['error' => $exception->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        return $this->json(['ok' => true]);
    }

    #[Route('', name: 'api_patterns_list', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function list(): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        $data = array_map(static fn (Pattern $p): array => [
            'id' => $p->getId(),
            'mode' => $p->getMode(),
            'geometryStyle' => $p->getGeometryStyle(),
            'title' => $p->getTitle(),
            'createdAt' => $p->getCreatedAt()->format(DATE_ATOM),
        ], $this->patterns->findByUserOrdered($user));

        return $this->json($data);
    }

    #[Route('', name: 'api_patterns_create', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function create(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['error' => 'Invalid JSON'], Response::HTTP_BAD_REQUEST);
        }

        try {
            $pattern = $this->pendingPatternSave->createPattern($user, $payload);
        } catch (\InvalidArgumentException $exception) {
            return $this->json(['error' => $exception->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        $this->entityManager->persist($pattern);
        $this->entityManager->flush();

        return $this->json([
            'id' => $pattern->getId(),
            'title' => $pattern->getTitle() ?? 'Узор',
            'createdAt' => $pattern->getCreatedAt()->format(DATE_ATOM),
        ], Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'api_patterns_show', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_USER')]
    public function show(int $id): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        $pattern = $this->patterns->find($id);
        if (!$pattern instanceof Pattern || $pattern->getUser()->getId() !== $user->getId()) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->json([
            'id' => $pattern->getId(),
            'mode' => $pattern->getMode(),
            'geometryStyle' => $pattern->getGeometryStyle(),
            'geometryParams' => $pattern->getGeometryParams(),
            'featureTimeline' => $pattern->getFeatureTimeline(),
            'svg' => $pattern->getSvg(),
            'voiceProfileHash' => $pattern->getVoiceProfileHash(),
            'title' => $pattern->getTitle(),
            'createdAt' => $pattern->getCreatedAt()->format(DATE_ATOM),
        ]);
    }

    #[Route('/{id}', name: 'api_patterns_update', methods: ['PATCH'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_USER')]
    public function update(int $id, Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        $pattern = $this->patterns->find($id);
        if (!$pattern instanceof Pattern || $pattern->getUser()->getId() !== $user->getId()) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload) || !array_key_exists('title', $payload)) {
            return $this->json(['error' => 'title required'], Response::HTTP_BAD_REQUEST);
        }

        $title = trim((string) $payload['title']);
        if ($title === '') {
            $title = 'Узор';
        }
        if (mb_strlen($title) > 120) {
            return $this->json(['error' => 'title too long'], Response::HTTP_BAD_REQUEST);
        }

        $pattern->setTitle($title);
        $this->entityManager->flush();

        return $this->json([
            'id' => $pattern->getId(),
            'title' => $pattern->getTitle(),
        ]);
    }

    #[Route('/{id}', name: 'api_patterns_delete', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_USER')]
    public function delete(int $id): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        $pattern = $this->patterns->find($id);
        if (!$pattern instanceof Pattern || $pattern->getUser()->getId() !== $user->getId()) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }

        $this->entityManager->remove($pattern);
        $this->entityManager->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}
