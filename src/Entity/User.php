<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\UserInterface;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\UniqueConstraint(name: 'uniq_oauth', columns: ['oauth_provider', 'oauth_id'])]
#[ORM\Table(name: 'users')]
class User implements UserInterface
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 32)]
    private string $oauthProvider = '';

    #[ORM\Column(length: 128)]
    private string $oauthId = '';

    #[ORM\Column(length: 180, nullable: true)]
    private ?string $email = null;

    #[ORM\Column(length: 120, nullable: true)]
    private ?string $displayName = null;

    /** @var list<string> */
    #[ORM\Column]
    private array $roles = ['ROLE_USER'];

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, Pattern> */
    #[ORM\OneToMany(mappedBy: 'user', targetEntity: Pattern::class, orphanRemoval: true)]
    private Collection $patterns;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->patterns = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getOauthProvider(): string
    {
        return $this->oauthProvider;
    }

    public function setOauthProvider(string $oauthProvider): self
    {
        $this->oauthProvider = $oauthProvider;

        return $this;
    }

    public function getOauthId(): string
    {
        return $this->oauthId;
    }

    public function setOauthId(string $oauthId): self
    {
        $this->oauthId = $oauthId;

        return $this;
    }

    public function getEmail(): ?string
    {
        return $this->email;
    }

    public function setEmail(?string $email): self
    {
        $this->email = $email;

        return $this;
    }

    public function getDisplayName(): ?string
    {
        return $this->displayName;
    }

    public function setDisplayName(?string $displayName): self
    {
        $this->displayName = $displayName;

        return $this;
    }

    public function getUserIdentifier(): string
    {
        if ($this->id === null) {
            throw new \LogicException('User id is not assigned yet.');
        }

        return (string) $this->id;
    }

    /** @return list<string> */
    public function getRoles(): array
    {
        return array_values(array_unique($this->roles));
    }

    /** @param list<string> $roles */
    public function setRoles(array $roles): self
    {
        $this->roles = $roles;

        return $this;
    }

    public function eraseCredentials(): void
    {
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    /** @return Collection<int, Pattern> */
    public function getPatterns(): Collection
    {
        return $this->patterns;
    }
}
