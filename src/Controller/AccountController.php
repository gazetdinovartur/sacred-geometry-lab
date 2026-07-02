<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\User;
use App\Repository\PatternRepository;
use App\Service\PendingPatternSaveService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class AccountController extends AbstractController
{
    public function __construct(
        private readonly PendingPatternSaveService $pendingPatternSave,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('/account', name: 'account')]
    public function index(Request $request, PatternRepository $patterns): Response
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            return $this->render('account/login.html.twig');
        }

        $savedPatternId = null;
        if ($this->pendingPatternSave->hasPendingInSession($request)) {
            try {
                $pattern = $this->pendingPatternSave->consumeFromSession($request, $user, $this->entityManager);
                if ($pattern !== null) {
                    $savedPatternId = $pattern->getId();
                    $this->addFlash('success', 'Узор из последней сессии сохранён в своё место.');
                }
            } catch (\Throwable) {
                $this->addFlash('error', 'Не удалось сохранить узор после входа. Попробуйте ещё раз с главной.');
            }
        }

        if ($savedPatternId !== null) {
            return $this->redirect('/account#pattern-'.$savedPatternId);
        }

        $rows = $patterns->findByUserOrdered($user);

        return $this->render('account/index.html.twig', [
            'user_label' => $user->getDisplayName() ?? $user->getEmail(),
            'patterns_data' => array_map(static fn (\App\Entity\Pattern $p): array => [
                'id' => $p->getId(),
                'title' => $p->getTitle() ?? 'Узор',
                'mode' => $p->getMode(),
                'geometryStyle' => $p->getGeometryStyle(),
                'createdAt' => $p->getCreatedAt()->format(DATE_ATOM),
                'svg' => $p->getSvg(),
            ], $rows),
        ]);
    }

    #[Route('/account/logout', name: 'account_logout')]
    public function logout(): never
    {
        throw new \LogicException('Logout handled by firewall.');
    }
}
