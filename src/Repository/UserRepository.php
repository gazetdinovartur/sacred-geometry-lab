<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/** @extends ServiceEntityRepository<User> */
final class UserRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, User::class);
    }

    public function findByOAuth(string $provider, string $oauthId): ?User
    {
        return $this->findOneBy([
            'oauthProvider' => $provider,
            'oauthId' => $oauthId,
        ]);
    }

    public function findOrCreate(string $provider, string $oauthId, ?string $email, ?string $displayName): User
    {
        $existing = $this->findByOAuth($provider, $oauthId);
        if ($existing instanceof User) {
            $existing->setEmail($email);
            $existing->setDisplayName($displayName);

            return $existing;
        }

        $user = (new User())
            ->setOauthProvider($provider)
            ->setOauthId($oauthId)
            ->setEmail($email)
            ->setDisplayName($displayName);

        $this->getEntityManager()->persist($user);

        return $user;
    }
}
