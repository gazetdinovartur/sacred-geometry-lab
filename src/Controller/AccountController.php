<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\PatternRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class AccountController extends AbstractController
{
    #[Route('/account', name: 'account')]
    public function index(PatternRepository $patterns): Response
    {
        $user = $this->getUser();
        if (!$user instanceof \App\Entity\User) {
            return $this->render('account/login.html.twig');
        }

        $rows = $patterns->findByUserOrdered($user);

        return $this->render('account/index.html.twig', [
            'patterns_data' => array_map(static fn (\App\Entity\Pattern $p): array => [
                'id' => $p->getId(),
                'title' => $p->getTitle() ?? 'Узор',
                'mode' => $p->getMode(),
                'geometryStyle' => $p->getGeometryStyle(),
                'createdAt' => $p->getCreatedAt()->format('d.m.Y H:i'),
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
