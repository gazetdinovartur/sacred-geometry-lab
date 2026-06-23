<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/account')]
final class AccountApiController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly Security $security,
    ) {
    }

    #[Route('', name: 'api_account_delete', methods: ['DELETE'])]
    #[IsGranted('ROLE_USER')]
    public function delete(): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        $this->entityManager->remove($user);
        $this->entityManager->flush();
        $this->security->logout(false);

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}
