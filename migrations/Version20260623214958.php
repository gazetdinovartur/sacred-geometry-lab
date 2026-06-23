<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260623214958 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE patterns (id INT AUTO_INCREMENT NOT NULL, mode VARCHAR(16) NOT NULL, geometry_style VARCHAR(24) NOT NULL, geometry_params JSON NOT NULL, feature_timeline JSON NOT NULL, svg LONGTEXT NOT NULL, voice_profile_hash VARCHAR(64) DEFAULT NULL, title VARCHAR(120) DEFAULT NULL, created_at DATETIME NOT NULL, user_id INT NOT NULL, INDEX IDX_11ADDDD0A76ED395 (user_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE users (id INT AUTO_INCREMENT NOT NULL, oauth_provider VARCHAR(32) NOT NULL, oauth_id VARCHAR(128) NOT NULL, email VARCHAR(180) DEFAULT NULL, display_name VARCHAR(120) DEFAULT NULL, roles JSON NOT NULL, created_at DATETIME NOT NULL, UNIQUE INDEX uniq_oauth (oauth_provider, oauth_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE patterns ADD CONSTRAINT FK_11ADDDD0A76ED395 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE patterns DROP FOREIGN KEY FK_11ADDDD0A76ED395');
        $this->addSql('DROP TABLE patterns');
        $this->addSql('DROP TABLE users');
    }
}
